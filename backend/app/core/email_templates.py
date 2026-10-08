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


def _button_email(heading: str, intro: str, cta_label: str, link: str, name: str, minutes: int, footer: str) -> tuple[str, str]:
    """Shared layout for every "click this link" email — a heading, an intro line, a
    brand-colored button, the expiry note, and a sign-off. Only the copy varies."""
    duration = _humanize_minutes(minutes)

    text = (
        f"Hello {name},\n\n"
        f"{intro}\n\n"
        f"{cta_label} here — this link expires in {duration} and can only be used once:\n"
        f"{link}\n\n"
        f"{footer}\n\n"
        f"Regards,\n{BRAND} Team"
    )

    html = f"""\
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#F4F4F2;font-family:Segoe UI,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F2;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:10px;overflow:hidden;max-width:480px;width:100%;">
          <tr><td style="background:{BRAND_RED};height:5px;"></td></tr>
          <tr><td style="padding:32px 32px 8px;">
            <h1 style="margin:0 0 20px;font-size:19px;color:#17181A;">{heading}</h1>
            <p style="margin:0 0 12px;font-size:14px;color:#3A3D42;line-height:1.55;">Hello {name},</p>
            <p style="margin:0 0 24px;font-size:14px;color:#3A3D42;line-height:1.55;">{intro}</p>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
              <tr><td style="background:{BRAND_RED};border-radius:8px;">
                <a href="{link}"
                   style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;
                          color:#ffffff;text-decoration:none;">{cta_label}</a>
              </td></tr>
            </table>
            <p style="margin:0 0 8px;font-size:13px;color:#6B6F76;">
              This link will expire in <b>{duration}</b> and can only be used once.
            </p>
            <p style="margin:0 0 28px;font-size:13px;color:#6B6F76;">{footer}</p>
            <p style="margin:0;font-size:13px;color:#6B6F76;">Regards,<br/>{BRAND} Team</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>"""
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


def invite_email(name: str, role: str, set_password_link: str, minutes: int) -> tuple[str, str]:
    """(plain_text, html) for a new account: no password is set by whoever created it —
    the account is unusable until this link is followed and a password is chosen."""
    intro = f"An account has been created for you on {BRAND} as {role}. Set a password to get started."
    footer = "If you weren't expecting this, you can ignore this email — the account will simply stay inactive."
    return _button_email(f"Welcome to {BRAND}", intro, "Set Your Password", set_password_link, name, minutes, footer)


def email_changed_email(name: str, new_email: str) -> tuple[str, str]:
    """(plain_text, html) sent to the OLD address when an admin moves an active account to a
    new one — a heads-up for the person who may not know, with no link to act on."""
    intro = f"The email address on your {BRAND} account was changed by an administrator to {new_email}."
    footer = "Sign-in links and notifications now go to the new address. If you didn't expect this, contact your administrator."
    text = f"Hello {name},\n\n{intro}\n\n{footer}\n\nRegards,\n{BRAND} Team"
    html = f"""\
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#F4F4F2;font-family:Segoe UI,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F2;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:10px;overflow:hidden;max-width:480px;width:100%;">
          <tr><td style="background:{BRAND_RED};height:5px;"></td></tr>
          <tr><td style="padding:32px;">
            <h1 style="margin:0 0 20px;font-size:19px;color:#17181A;">Your account email was changed</h1>
            <p style="margin:0 0 12px;font-size:14px;color:#3A3D42;line-height:1.55;">Hello {name},</p>
            <p style="margin:0 0 16px;font-size:14px;color:#3A3D42;line-height:1.55;">{intro}</p>
            <p style="margin:0 0 28px;font-size:13px;color:#6B6F76;">{footer}</p>
            <p style="margin:0;font-size:13px;color:#6B6F76;">Regards,<br/>{BRAND} Team</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>"""
    return text, html
