from datetime import date
from decimal import Decimal
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.v1.auth import get_current_user_token
from app.api.v1 import invoice as api_module
from app.core.database import get_db
from app.repositories import gcp_invoice as srm, po_portal_invoice as po
from app.services.po_portal_invoice import map_po_portal_invoice_to_response


def row(**changes):
    return dict(Reference='INV/PO/1', Purchasing_Document='650001', Item='10',
                SUPPLIER='V1', SUPPLIER_NAME='Supplier One', PAN_NO='ABCDE1234F',
                Invoice_Creation_Date='2026-09-01', Invoice_Upload_Date='2026-09-02',
                Invoice_Uploaded='YES', MIRO_BOOKED='PENDING FOR MIRO',
                Status_OF_HOD='SC', HOD1_Status='', HOD2_Status='', Accounts_Status='',
                Created_by_HOD1='First reviewer', Created_by_HOD2='', Created_by_ACCOUNTS='',
                UTR_NUMBER='', CLEARING_DATE='', Service='000123', Line_Number='1',
                FILTER_FISCAL_YEAR='2027', PAYABLE_AMOUNT='1250.50', CURRENCY='INR', **changes)


@pytest.mark.parametrize('changes,expected', [
    ({'Invoice_Uploaded': 'NO'}, 'Initial'),
    ({}, 'Invoice Uploaded'),
    ({'HOD1_Status': 'APPROVED'}, 'Approved'),
    ({'HOD1_Status': 'APPROVED', 'Created_by_HOD2': 'Second reviewer'}, 'Pending for Approval'),
    ({'HOD1_Status': 'APPROVED', 'Created_by_HOD2': '-'}, 'Approved'),
    ({'HOD2_Status': 'APPROVED', 'Created_by_HOD2': 'Second reviewer'}, 'Approved'),
    ({'Status_OF_HOD': 'INFO'}, 'Action Required'),
    ({'Status_OF_HOD': 'INFO', 'HOD2_Status': 'APPROVED'}, 'Action Required'),
    ({'HOD1_Status': 'REJECTED', 'Status_OF_HOD': 'INFO'}, 'Rejected'),
    ({'HOD2_Status': 'REJECTED', 'HOD1_Status': 'APPROVED'}, 'Rejected'),
    ({'Accounts_Status': 'REJECTED', 'HOD2_Status': 'APPROVED'}, 'Rejected'),
    ({'MIRO_BOOKED': 'MIRO BOOKED', 'Accounts_Status': 'REJECTED'}, 'Miro Booked'),
    ({'MIRO_BOOKED': 'MIRO BOOKED', 'Invoice_Uploaded': 'NO'}, 'Miro Booked'),
    ({'UTR_NUMBER': 'UTR1', 'Accounts_Status': 'REJECTED'}, 'Paid'),
    ({'CLEARING_DATE': '2026-10-01', 'Invoice_Uploaded': 'NO'}, 'Paid'),
    ({'UTR_NUMBER': ' - ', 'CLEARING_DATE': 'invalid'}, 'Invoice Uploaded'),
    ({'UTR_CLEARING_DATE_PAID': '2026-10-01', 'NET_DUE_DATE': '2020-01-01'}, 'Invoice Uploaded'),
    ({'HOD1_Status': ' approved ', 'Created_by_HOD2': ' Reviewer ', 'HOD2_Status': ' '}, 'Pending for Approval'),
    ({'STATUS': 'APPROVED', 'Flag': 'REJECTED', 'Edit_Status': 'R'}, 'Invoice Uploaded'),
])
def test_agreed_priority(changes, expected):
    raw = row()
    raw.update(changes)
    assert po.invoice_status(raw) == expected
    assert srm.invoice_status(po.normalize_row(raw)) == expected


def test_mapping_preserves_evidence_without_inventing_approval_dates_or_srm_flags():
    raw = row()
    raw.update(Accounts_Status='REJECTED', Edit_Rejection_Comment='Please correct invoice',
               UTR_NUMBER='UTR1', CLEARING_DATE='2026-10-04', MIRO_POSTING_DATE='2026-10-01',
               MIRO_Created_on='2026-09-30', Posting_Date='2026-09-29', RSEG_POSTING_DATE='2026-10-02',
               NET_DUE_DATE='2026-11-01', Payment_Due_Date='2026-12-01')
    mapped = map_po_portal_invoice_to_response(po.normalize_row(raw, 'poPortal:test'))
    assert mapped.invoice_number == raw['Reference']
    assert mapped.channel == 'poPortal'
    assert mapped.product_type == 'S'
    assert mapped.status_flag is None
    assert mapped.overall_status == 'Paid'
    assert mapped.workflow.rejection_reason == 'Please correct invoice'
    assert mapped.po_portal.accounts_status == 'REJECTED'
    assert mapped.workflow.final_approval_date is None
    assert mapped.workflow.approved_by is None
    assert mapped.workflow.approvers.approver_1 is None
    assert mapped.sap.document_date is None
    assert mapped.sap.miro_document is None
    assert mapped.sap.miro_booking_date == date(2026, 10, 1)
    assert mapped.po_portal.miro_created_on == date(2026, 9, 30)
    assert mapped.po_portal.posting_date == date(2026, 9, 29)
    assert mapped.po_portal.rseg_posting_date == date(2026, 10, 2)
    assert mapped.sap.net_due_date == date(2026, 11, 1)
    assert mapped.sap.payable_amount == Decimal('1250.50')


@pytest.fixture
def api(monkeypatch):
    raw = row()
    raw.update(HOD1_Status='APPROVED', Created_by_HOD2='Second reviewer', Comments='Private note')
    another = row()
    another.update(Reference='OTHER', SUPPLIER='V2', UTR_NUMBER='UTR2', Invoice_Upload_Date='2026-10-10')
    monkeypatch.setattr(po, '_cached_invoices', [po.normalize_row(raw, 'poPortal:1'), po.normalize_row(another, 'poPortal:2')])
    monkeypatch.setattr(srm, '_cached_invoices', [{'VENDOR_INVOICE_NO': 'SRM1', 'SUPPLIER': 'V1', 'STATUS_FLAG': 'A'}])
    app = FastAPI()
    app.include_router(api_module.router, prefix='/api/v1')
    app.dependency_overrides[get_current_user_token] = lambda: {'auth_type': 'internal', 'scope': {'channelScope': 'all'}}
    app.dependency_overrides[get_db] = lambda: None
    return TestClient(app), app


def test_channel_list_summary_recent_and_detail_share_mapping(api):
    client, _ = api
    params = {'channel': 'poPortal', 'hod1_status': 'APPROVED', 'payment_status': 'unpaid'}
    listed = client.get('/api/v1/invoices/list-invoices', params=params).json()
    summary = client.get('/api/v1/invoices/invoice-summary', params=params).json()
    recent = client.get('/api/v1/invoices/recent-invoices', params=params).json()
    assert listed['total'] == summary['total'] == len(recent) == 1
    assert listed['items'] == recent
    assert summary['byChannel'] == [{'key': 'poPortal', 'value': 1}]
    assert summary['kpi']['pendingApproval'] == 1
    detail = client.get('/api/v1/invoices/invoice-details/INV/PO/1', params={'channel': 'poPortal', 'source_id': 'poPortal:1'})
    assert detail.json() == recent[0]
    assert client.get('/api/v1/invoices/list-invoices').json()['total'] == 1  # SRM default unchanged
    assert client.get('/api/v1/invoices/list-invoices?channel=all').json()['total'] == 3


@pytest.mark.parametrize('params,total', [
    ({'date_type': 'upload', 'date_from': '2026-10-10'}, 1),
    ({'date_type': 'approval', 'date_from': '2026-01-01'}, 0),
    ({'product_type': 'M'}, 0), ({'product_type': 'S'}, 2),
    ({'approval_stage': 'SC'}, 2), ({'invoice_uploaded': False}, 0),
    ({'approver': 'second'}, 1), ({'pending_with': 'second'}, 1),
    ({'vendor_code': 'V2', 'payment_status': 'paid'}, 1),
])
def test_po_filters(api, params, total):
    client, _ = api
    params = {'channel': 'poPortal', **params}
    assert client.get('/api/v1/invoices/list-invoices', params=params).json()['total'] == total
    assert client.get('/api/v1/invoices/invoice-summary', params=params).json()['total'] == total


def test_ambiguous_service_lines_require_source_id(api, monkeypatch):
    client, _ = api
    raw = row()
    monkeypatch.setattr(po, '_cached_invoices', [po.normalize_row(raw, 'one'), po.normalize_row({**raw, 'Line_Number': '2'}, 'two')])
    url = '/api/v1/invoices/invoice-details/INV/PO/1'
    assert client.get(url, params={'channel': 'poPortal', 'po_item': 10}).status_code == 409
    assert client.get(url, params={'channel': 'poPortal', 'source_id': 'two'}).json()['po_portal']['line_number'] == '2'


def test_managed_supplier_is_vendor_and_channel_scoped_and_redacted(api, monkeypatch):
    client, app = api
    app.dependency_overrides[get_current_user_token] = lambda: {'auth_type': 'supplier', 'scope': {'stamp': 'valid'}}
    monkeypatch.setattr(api_module, '_supplier_codes', lambda user, db: ['V1'])
    monkeypatch.setattr(api_module, 'load_active_supplier', lambda db, user: SimpleNamespace(channel='poPortal'))
    for endpoint in ['list-invoices', 'recent-invoices']:
        response = client.get(f'/api/v1/invoices/{endpoint}?channel=all&vendor_code=V2')
        assert response.status_code == 200
        body = response.json()
        items = body if isinstance(body, list) else body['items']
        assert len(items) == 1
        inv = items[0]
        assert inv['supplier']['vendor_code'] == 'V1'
        assert inv['workflow']['pending_with'] is None
        assert inv['po_portal']['hod1'] is None
        assert inv['po_portal']['hod2'] is None
        assert inv['po_portal']['comments'] is None
    assert client.get('/api/v1/invoices/list-invoices?channel=msetuSrm').status_code == 403
    assert client.get('/api/v1/invoices/list-invoices?channel=poPortal&hod1_status=APPROVED').status_code == 403
    assert client.get('/api/v1/invoices/invoice-details/OTHER?channel=poPortal').status_code == 404


def test_internal_workspace_scope(api):
    client, app = api
    app.dependency_overrides[get_current_user_token] = lambda: {'auth_type': 'internal', 'scope': {'channelScope': 'poPortal'}}
    assert client.get('/api/v1/invoices/list-invoices?channel=all').json()['total'] == 2
    assert client.get('/api/v1/invoices/list-invoices?channel=msetuSrm').status_code == 403


def test_loader_preserves_duplicate_lines_and_ids_are_repeatable(tmp_path, monkeypatch):
    import csv
    file = tmp_path / 'po.csv'
    raw = row()
    with file.open('w', encoding='utf-8-sig', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=list(raw))
        writer.writeheader()
        writer.writerows([raw, raw, {**raw, 'Line_Number': '2'}])
    monkeypatch.setattr(po, 'CSV_FILE', file)
    monkeypatch.setattr(po, '_cached_invoices', None)
    first = po.get_all_cached_invoices()
    assert len(first) == 3
    ids = [r['__source_id'] for r in first]
    assert len(set(ids)) == 3
    monkeypatch.setattr(po, '_cached_invoices', None)
    assert [r['__source_id'] for r in po.get_all_cached_invoices()] == ids


def test_ticket_context_uses_po_channel_and_cannot_pick_arbitrary_service_line(api):
    from app.services.ticket_service import _invoice_context
    context = _invoice_context('INV/PO/1', channel='poPortal', source_id='poPortal:1', vendor_codes=['V1'])
    assert context['channel'] == 'poPortal'
    assert context['vendor_code'] == 'V1'
    assert context['invoice'].source_id == 'poPortal:1'


def test_vendor_directory_includes_po_suppliers_without_inventing_pan_ownership(api):
    from app.services.vendor_directory import get_vendor_by_pan
    assert sorted(get_vendor_by_pan('ABCDE1234F')['codes'].values()) == ['V1', 'V2']


def test_po_query_creation_routes_to_correct_channel_and_vendor(api):
    from sqlalchemy import event
    from app.core.database import SessionLocal
    from app.models.ticket import Ticket
    from app.schemas.ticket import TicketCreate
    from app.services.ticket_service import create_ticket
    user = dict(auth_type='supplier', vendor_code='V1', vendor_codes=['V1'], name='Supplier', user_id=None,
                ticket_role='SUPPLIER', channel_scope='poPortal', allowed_channels=[])
    body = TicketCreate(invoice_no='INV/PO/1', invoice_channel='poPortal', invoice_source_id='poPortal:1',
                        category='PAYMENT_STATUS', subject='Payment query', description='Please confirm status')
    def sqlite_sequence(_mapper, _connection, target):
        # The application's MySQL migration generates this value server-side.
        target.ticket_sequence = 900001
    event.listen(Ticket, 'before_insert', sqlite_sequence)
    try:
        with SessionLocal() as db:
            result = create_ticket(db, user, body)
    finally:
        event.remove(Ticket, 'before_insert', sqlite_sequence)
    assert result['channel'] == 'poPortal'
    assert result['vendor_code'] == 'V1'
    assert result['invoice']['invoice_no'] == 'INV/PO/1'
