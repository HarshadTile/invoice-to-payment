from html import escape
"""HTML/plain-text bodies for transactional emails. Kept separate from the endpoints
that trigger them so the copy/design can change without touching request handling."""

BRAND = "Invoice to Payment Tracker"
BRAND_RED = "#C4122E"  # matches the app's own brand color (frontend/src/theme.css --brand)


def _humanize_minutes(minutes: int) -> str:
    if minutes % 1440 == 0 and minutes >= 1440:
        days = minutes // 1440
        return f"{days} day{'s' if days != 1 else ''}"
    if minutes % 60 == 0 and minutes >= 60:
        hours = minutes // 60
        return f"{hours} hour{'s' if hours != 1 else ''}"
    return f"{minutes} minute{'s' if minutes != 1 else ''}"


def _page(heading: str, name: str, body: str, footer: str, padding: str = "32px") -> str:
    """The branded HTML frame every email shares: red bar, heading, greeting, body, footer and
    sign-off. `heading`, `name` and `footer` are plain text; `body` is HTML."""
    return f"""\
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#F4F4F2;font-family:Segoe UI,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F2;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:10px;overflow:hidden;max-width:480px;width:100%;">
          <tr><td style="background:{BRAND_RED};height:5px;"></td></tr>
          <tr><td style="padding:{padding};">
            <h1 style="margin:0 0 20px;font-size:19px;color:#17181A;">{escape(heading)}</h1>
            <p style="margin:0 0 12px;font-size:14px;color:#3A3D42;line-height:1.55;">Hello {escape(name)},</p>
            {body}
            <p style="margin:0 0 28px;font-size:13px;color:#6B6F76;">{escape(footer)}</p>
            <p style="margin:0;font-size:13px;color:#6B6F76;">Regards,<br/>{BRAND} Team</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>"""


def _button_email(heading: str, intro: str, cta_label: str, link: str, name: str, minutes: int, footer: str, note: str = "") -> tuple[str, str]:
    """Shared layout for every "click this link" email — a heading, an intro line, an optional
    highlighted note, a brand-colored button, the expiry note, and a sign-off. Only the copy varies."""
    duration = _humanize_minutes(minutes)
    note_text = f"{note}\n\n" if note else ""
    note_html = (
        '<p style="margin:0 0 24px;padding:12px 14px;border-left:3px solid #C4122E;background:#FFF5F6;'
        f'font-size:14px;color:#3A3D42;line-height:1.55;white-space:pre-line;">{escape(note)}</p>'
    ) if note else ""

    text = (
        f"Hello {name},\n\n"
        f"{intro}\n\n"
        f"{note_text}"
        f"{cta_label} here — this link expires in {duration} and can only be used once:\n"
        f"{link}\n\n"
        f"{footer}\n\n"
        f"Regards,\n{BRAND} Team"
    )

    body = f"""\
<p style="margin:0 0 24px;font-size:14px;color:#3A3D42;line-height:1.55;">{intro}</p>
            {note_html}
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
              <tr><td style="background:{BRAND_RED};border-radius:8px;">
                <a href="{link}"
                   style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;
                          color:#ffffff;text-decoration:none;">{cta_label}</a>
              </td></tr>
            </table>
            <p style="margin:0 0 8px;font-size:13px;color:#6B6F76;">
              This link will expire in <b>{duration}</b> and can only be used once.
            </p>"""
    html = _page(heading, name, body, footer, padding="32px 32px 8px")
    return text, html


def password_reset_email(name: str, reset_link: str, minutes: int, admin_initiated: bool = False) -> tuple[str, str]:
    """(plain_text, html) for a password-reset email.

    `admin_initiated`: True when an admin triggered this from Settings > Users (the admin
    never sets or sees the new password — this email, sent to the account holder, is the
    only way it gets set); False for a self-service request from the login screen."""
    intro = (
        "An administrator has started a password reset for your account."
        if admin_initiated else
        f"We received a request to reset your {BRAND} password."
    )
    footer = "If you weren't expecting this, you can safely ignore this email — your password won't change."
    return _button_email("Password Reset Request", intro, "Set New Password", reset_link, name, minutes, footer)


INQUIRY_DESK_LABEL = {
    "ADMIN": "Admin (sees and manages every query)",
    "CHANNEL_LEAD": "Channel Lead (assigns and oversees queries in your channel)",
    "ASSIGNEE": "Assignee (replies to and resolves the queries assigned to you)",
}


def invite_access_note(role: str, portal: str, inquiry_desk: str | None, email: str, sign_in_url: str) -> str:
    """What the new person can use and exactly how to sign in, for the invite email."""
    desk = INQUIRY_DESK_LABEL.get(inquiry_desk or "", "No access")
    return (
        "Your access\n"
        f"• Role: {role}\n"
        f"• Portal: {portal}\n"
        f"• Inquiry Desk: {desk}\n"
        "\n"
        "How to sign in\n"
        "1. Click Set Your Password below and choose a password.\n"
        f"2. Open {sign_in_url} and choose Internal Team.\n"
        f"3. In Portal / Team, select {portal}.\n"
        f"4. Enter your email ({email}) and your new password, then click Continue."
    )


def invite_email(name: str, role: str, set_password_link: str, minutes: int, access_note: str = "") -> tuple[str, str]:
    """(plain_text, html) for a new account: no password is set by whoever created it —
    the account is unusable until this link is followed and a password is chosen. `access_note`
    says what the person can use and how to sign in."""
    intro = f"An account has been created for you on {BRAND} as {role}. Set a password to get started."
    footer = "If you weren't expecting this, you can ignore this email — the account will simply stay inactive."
    return _button_email(f"Welcome to {BRAND}", intro, "Set Your Password", set_password_link, name, minutes, footer, access_note)


def supplier_access_email(name: str, email: str, setup_link: str, minutes: int, reset: bool = False, note: str = "") -> tuple[str, str]:
    """Supplier account setup/reset message; suppliers sign in with their email and password."""
    if reset:
        intro = f"A password reset was requested for your Mahindra Supplier Portal account ({email})."
    else:
        intro = f"Your Mahindra Supplier Portal account is ready. Set a password, then sign in with your email {email}."
    footer = "If you weren't expecting this, you can safely ignore this email and contact your Mahindra representative."
    heading = "Reset your supplier portal password" if reset else "Set up your supplier portal access"
    label = "Choose a New Password" if reset else "Set Your Password"
    return _button_email(heading, intro, label, setup_link, name, minutes, footer, note)


def _notice_email(heading: str, name: str, paragraphs: list[str], footer: str) -> tuple[str, str]:
    """(plain_text, html) for an email that only informs: no link to act on."""
    text = f"Hello {name},\n\n" + "\n\n".join(paragraphs) + f"\n\n{footer}\n\nRegards,\n{BRAND} Team"
    body = "".join(
        f'<p style="margin:0 0 16px;font-size:14px;color:#3A3D42;line-height:1.55;white-space:pre-line;">{escape(p)}</p>'
        for p in paragraphs
    )
    html = _page(heading, name, body, footer)
    return text, html


SUPPLIER_FOOTER = "This is an automated message from the Mahindra Supplier Portal."


def supplier_request_received_email(name: str, codes: list[str]) -> tuple[str, str]:
    return _notice_email(
        "We received your access request", name,
        [f"Thank you. Your request for supplier portal access (vendor codes: {', '.join(codes)}) has reached the Mahindra team.",
         "You'll receive another email once it has been reviewed."],
        SUPPLIER_FOOTER,
    )


def supplier_request_rejected_email(name: str, reason: str, message: str) -> tuple[str, str]:
    paragraphs = [f"Your supplier portal access request could not be approved: {reason}."]
    if message:
        paragraphs.append(message)
    paragraphs.append("You can send a new request with the corrected details from the supplier sign-in page.")
    return _notice_email("Your access request needs attention", name, paragraphs, SUPPLIER_FOOTER)


def supplier_access_changed_email(name: str, added: list[str], removed: list[str], codes: list[str], note: str = "") -> tuple[str, str]:
    paragraphs = ["Your vendor code access on the Mahindra Supplier Portal has been updated."]
    if added:
        paragraphs.append(f"Added: {', '.join(added)}")
    if removed:
        paragraphs.append(f"Removed: {', '.join(removed)}")
    paragraphs.append(f"Your account now covers: {', '.join(codes) if codes else 'no vendor codes'}.")
    if note:
        paragraphs.append(note)
    return _notice_email("Your vendor code access changed", name, paragraphs, SUPPLIER_FOOTER)


def email_changed_email(name: str, new_email: str) -> tuple[str, str]:
    """(plain_text, html) sent to the OLD address when an admin moves an active account to a
    new one — a heads-up for the person who may not know, with no link to act on."""
    intro = f"The email address on your {BRAND} account was changed by an administrator to {new_email}."
    footer = "Sign-in links and notifications now go to the new address. If you didn't expect this, contact your administrator."
    return _notice_email("Your account email was changed", name, [intro], footer)
