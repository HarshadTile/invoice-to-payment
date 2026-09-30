import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.api.v1.auth import get_current_user_token

client = TestClient(app)

def mock_supplier_a():
    return {"authType": "supplier", "vcode": "SUP-A", "company": "Company A"}

def mock_supplier_b():
    return {"authType": "supplier", "vcode": "SUP-B", "company": "Company B"}

def mock_staff():
    return {"authType": "internal", "id": 1, "role": "ADMIN", "channelScope": "all", "name": "Admin User"}

@pytest.fixture(autouse=True)
def clear_dependency_overrides():
    app.dependency_overrides = {}

def test_create_and_idempotency():
    app.dependency_overrides[get_current_user_token] = mock_supplier_a
    
    payload = {
        "category": "Inquiry",
        "priority": "HIGH",
        "subject": "Missing Payment",
        "description": "I did not receive my payment",
        "vendor_code": "SUP-A"
    }
    
    # First create
    res1 = client.post("/api/v1/tickets", json=payload, headers={"Idempotency-Key": "test-key-123"})
    assert res1.status_code == 200
    ticket_id = res1.json()["id"]
    
    # Second create with same key
    res2 = client.post("/api/v1/tickets", json=payload, headers={"Idempotency-Key": "test-key-123"})
    assert res2.status_code == 200
    assert res2.json()["id"] == ticket_id
    
    # Different key
    res3 = client.post("/api/v1/tickets", json=payload, headers={"Idempotency-Key": "test-key-456"})
    assert res3.status_code == 200
    assert res3.json()["id"] != ticket_id

def test_supplier_isolation():
    # Create ticket as Supplier A
    app.dependency_overrides[get_current_user_token] = mock_supplier_a
    payload = {
        "category": "Inquiry",
        "priority": "LOW",
        "subject": "A's Ticket",
        "description": "desc",
        "vendor_code": "SUP-A"
    }
    res_create = client.post("/api/v1/tickets", json=payload)
    assert res_create.status_code == 200
    ticket_id = res_create.json()["id"]
    
    # Supplier B tries to access it
    app.dependency_overrides[get_current_user_token] = mock_supplier_b
    res_get = client.get(f"/api/v1/tickets/{ticket_id}")
    assert res_get.status_code == 404
    
    res_comment = client.post(f"/api/v1/tickets/{ticket_id}/comments", json={"text": "Hello"})
    assert res_comment.status_code == 404

def test_internal_notes_hidden_from_supplier():
    # Staff creates a ticket
    app.dependency_overrides[get_current_user_token] = mock_staff
    payload = {
        "category": "Inquiry",
        "priority": "MEDIUM",
        "subject": "Supplier Issue",
        "description": "Needs investigation",
        "vendor_code": "SUP-A"
    }
    res_create = client.post("/api/v1/tickets", json=payload)
    ticket_id = res_create.json()["id"]
    version = res_create.json()["row_version"]
    
    # Staff adds internal note
    note_payload = {
        "text": "Internal thoughts",
        "visibility": "INTERNAL",
        "expected_version": version
    }
    res_note = client.post(f"/api/v1/tickets/{ticket_id}/comments", json=note_payload)
    assert res_note.status_code == 200
    
    # Staff adds public comment
    version2 = res_note.json()["row_version"]
    pub_payload = {
        "text": "Public reply",
        "visibility": "PUBLIC",
        "expected_version": version2
    }
    res_pub = client.post(f"/api/v1/tickets/{ticket_id}/comments", json=pub_payload)
    assert res_pub.status_code == 200
    
    # Supplier A fetches ticket
    app.dependency_overrides[get_current_user_token] = mock_supplier_a
    res_get = client.get(f"/api/v1/tickets/{ticket_id}")
    assert res_get.status_code == 200
    
    data = res_get.json()
    comments = data["comments"]
    assert len(comments) == 1
    assert comments[0]["visibility"] == "PUBLIC"
    assert comments[0]["text"] == "Public reply"
