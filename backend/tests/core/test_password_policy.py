"""New-password rules: length, character mix, no common or personal passwords."""
import pytest

from app.core.password_policy import MIN_LENGTH, problems

GOOD = ["Blue-Harbor-71", "monsoon Train 4 tea", "Kx9!vR2#pLm7", "invoices-ARE-paid-2026"]


@pytest.mark.parametrize("password", GOOD)
def test_strong_passwords_pass(password):
    assert problems(password, ["ravi.k", "ravi.k@mahindra.com", "Ravi Kulkarni"]) == []


@pytest.mark.parametrize("password, expected", [
    ("Short1!", "at least 12"),
    ("alllowercaseletters", "at least 3 of"),
    ("ALLUPPERCASE2026", "at least 3 of"),
    ("Password@123", "too common"),
    ("Welcome2026!!", "too common"),
    ("Mahindra#2026", "too common"),
    ("##Qwerty12345", "too common"),
    ("Abcdefghijkl1", "too common"),          # a keyboard / alphabet run
    ("Aaaaaaaaaaa1!", "different characters"),
    ("X" * 60 + "aa11!!" * 2, "at most"),
])
def test_weak_passwords_are_rejected_with_a_reason(password, expected):
    found = " ".join(problems(password))
    assert expected in found, found


def test_personal_details_are_rejected():
    personal = ["harshad", "tile.harshad@mahindra.com", "Tile Harshad"]
    assert any("name, username or email" in p for p in problems("Harshad-Secure-99", personal))
    assert any("name, username or email" in p for p in problems("Blue-TILE-harbor9", personal))
    assert problems("Blue-Harbor-71", personal) == []


def test_every_broken_rule_is_listed():
    assert len(problems("abc")) >= 3  # too short, too few character types, too common
    assert any(str(MIN_LENGTH) in p for p in problems(""))
