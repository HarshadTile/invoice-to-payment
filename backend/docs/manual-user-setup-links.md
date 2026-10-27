# Manual user setup and reset links

SMTP is not required. Administrators create a user in **Settings > Users**,
then use **Copy invitation** to share a message containing the sign-in email,
one-time link and expiry privately using their chosen channel.
The recipient sets a password; the account becomes Active. The placeholder
password is random, hashed and never shown. Sign-in uses email; existing username
logins remain compatible.

- Setup links default to 7 days; reset links default to 24 hours. Both are single-use.
- In Settings > Users, users with Manage Users permission can save separate link
  expiry defaults: 30 minutes, 1/4/12/24 hours, or 2/3/7 days. These defaults apply
  only to newly generated links, including replacements and email changes.
- Copy invitation briefly changes to a green Copied button after successful copying.
- The key action generates a replacement and invalidates earlier links.
- Changing email also revokes old links and presents a replacement.
- Inactive accounts cannot generate or consume links.
- Forgot Password directs the user to an administrator; it does not send email.
- Closing the popup discards its copy. Generate a new link if it was lost.
- No links appear in user-list responses or audit records. Newly stored tokens
  are SHA-256 digests. Unexpired legacy links remain usable until superseded.

## LAN demo

1. Run `ipconfig` and find the active adapter's IPv4 address. Addresses can change.
2. Set backend `.env`: `FRONTEND_URL=http://<LAN-IP>:5173`.
3. Restart FastAPI from `backend`:
   `.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000`.
4. Restart Vite from `frontend`: `npm.cmd run dev`.
   Vite listens on all interfaces, port 5173, and fails if that port is occupied.
   Stop an older frontend before restarting it. FastAPI remains on loopback;
   Vite proxies the API so LAN clients only need frontend port 5173.
5. Open `http://<LAN-IP>:5173` on a second device. If unreachable, verify network
   routing/client isolation and the Windows Firewall rule for Node on the intended
   network. Do not disable the firewall or open the database to the network.
6. Create a test user, copy the setup link and open it on that device. Set a
   password, sign in with its email and assigned channel, then check that reuse
   of the link fails.

The recipient must be on a reachable LAN or VPN. A LAN address is not accessible
to arbitrary Internet users. Some browsers block automatic clipboard access on
HTTP LAN pages: the copy action selects the complete invitation message for
manual copying. The setup screen verifies the token before displaying the
account's sign-in email, and keeps that email visible after password setup.

## Production

Host the frontend and API at the approved public HTTPS address, configure
`FRONTEND_URL=https://your-portal.company.com`, and restart the backend. Use the
production reverse proxy for `/api/v1`; do not deploy Vite's development server.
The setup/reset workflow does not change. Share links as secrets and do not
include reset URL query strings in reverse-proxy access logs. The frontend uses
the `no-referrer` policy to prevent token-bearing URLs being sent as referrers.

## Tester checklist

- Use MySQL and run `alembic upgrade head`; the expected head is `3d2f71a9c8e4`.
- Configure your own `.env` and a reachable `FRONTEND_URL`. Do not copy another
  developer's credentials or commit `.env` or local supplier-mobile spreadsheets.
- As an authorized administrator, create a user and verify the name, sign-in
  email, assigned role/channel, expiry, and copied invitation message.
- Verify the copy button shows green Copied for three seconds. If LAN HTTP blocks
  clipboard access, verify the message opens and is selected for manual copying.
- Open a setup link in a private browser window, set a password, sign in using
  the displayed email, and verify assigned portal and Inquiry Desk access.
- Retry a used link and an older replaced link; both must be rejected.
- Generate a reset link for an active account. Save new setup/reset expiry
  defaults, refresh, and check new links use them while existing links retain
  their original expiry.
- Verify inactive accounts cannot receive or use links and users without
  Manage Users permission cannot modify users or expiry settings.
- Check password mismatch, short passwords, invalid/expired links, duplicate
  emails, and Forgot Password guidance. No SMTP delivery should be attempted.
- Check layouts and copy behavior in Chrome and Edge, including a second device
  on the intended LAN/VPN. Automated tests do not replace these browser checks.

## Verification without touching the application database

From `backend`:

```powershell
.\.venv\Scripts\python.exe -m pytest --noconftest -p link_tests.support link_tests/test_manual_links.py tests/test_password_reset.py tests/test_users_api.py -q -p no:cacheprovider
```

This plugin creates and disposes a unique temporary SQLite database. It bypasses
the legacy `tests/conftest.py`, which drops a fixed MySQL test database.

Apply migration `f2a94d6e8b10` with `alembic upgrade head` before starting the
updated backend. It adds setup/reset expiry settings with 7-day/24-hour defaults.
Historical supplier OTP migrations are retained so databases previously used on
that branch can upgrade normally. These schema migrations do not enable OTP
authentication. Do not delete applied migrations, stamp over missing revisions,
or reset the application database to resolve migration errors.

Link-issuing admin responses add `setupLink`, `expiryMinutes`,
`expiresAt` (UTC ISO timestamp), and `linkType` (`invite` / `reset`). Treat them as
transient UI data; the same fields are never included by GET Users.
