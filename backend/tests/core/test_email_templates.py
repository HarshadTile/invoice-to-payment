"""Account and supplier emails: link, expiry wording and HTML escaping."""
import pytest

from app.core import email_templates as tpl

LINK = "http://localhost:5173/reset-password?token=abc"


@pytest.mark.parametrize("minutes,text", [
    (30, "30 minutes"), (60, "1 hour"), (240, "4 hours"), (1440, "1 day"), (4320, "3 days"), (10080, "7 days"),
])
def test_expiry_is_written_in_plain_words(minutes, text):
    assert tpl._humanize_minutes(minutes) == text


def test_invite_email_carries_link_expiry_and_role():
    text, html = tpl.invite_email("Priya Nair", "Invoice Team L1", LINK, 10080)
    for body in (text, html):
        assert LINK in body and "7 days" in body and "Priya Nair" in body
    assert "Invoice Team L1" in text + html


def test_reset_email_says_the_link_is_single_use():
    text, html = tpl.password_reset_email("Priya", LINK, 60)
    assert LINK in html and "1 hour" in html and "only be used once" in html
    assert LINK in text


def test_supplier_setup_and_reset_emails_differ():
    setup_text, _ = tpl.supplier_access_email("Acme", "a@example.com", LINK, 1440)
    reset_text, _ = tpl.supplier_access_email("Acme", "a@example.com", LINK, 1440, reset=True)
    assert setup_text != reset_text and LINK in setup_text and LINK in reset_text


def test_user_supplied_text_is_html_escaped():
    _, html = tpl.supplier_access_email("<b>Acme</b>", "a@example.com", LINK, 60, note="<script>x</script>")
    assert "<script>" not in html and "&lt;script&gt;" in html
    assert "<b>Acme</b>" not in html


def test_rejection_email_includes_reason_and_message():
    text, html = tpl.supplier_request_rejected_email("Acme", "Details don't match our records", "Check vendor code 123")
    assert "Check vendor code 123" in text and "Check vendor code 123" in html


def test_email_changed_notice_names_the_new_address():
    text, html = tpl.email_changed_email("Priya", "new@example.com")
    assert "new@example.com" in text and "new@example.com" in html
