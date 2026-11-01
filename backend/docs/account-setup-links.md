# Account setup and password reset links

Setup and reset links are sent **by email only**. They never appear in the admin UI, in API
responses or in the audit log. Configure SMTP in `backend/.env` (`SMTP_HOST`, `SMTP_PORT`,
`SMTP_USER`, `SMTP_PASSWORD`, `SMTP_USE_TLS`, `EMAIL_FROM`) before relying on account emails;
without it, user and supplier management report that the email could not be sent.

## Internal users

- An administrator creates the user in **Settings › User Management** (**Create User & Generate
  Link**). The user receives a Welcome email with a **Set Your Password** link and status is
  **Invited** until they set a password, then **Active**.
- The key icon on a user's row (**Send account setup or password reset email**) sends a
  new setup link to an Invited user, or a reset link to an Active one. Each new link invalidates
  the earlier ones.
- Changing a user's email revokes their old links and emails a replacement to the new address;
  an Active user's old address also gets a notice that the email changed.
- **Forgot password?** on the sign-in page emails reset instructions and always shows the same
  message, so it never reveals whether an account exists.
- Inactive accounts cannot receive or use links.

## Suppliers

- **Settings › Supplier Management**: approving an access request or **Add Supplier** emails a
  setup link; the row icons send a new setup or password reset email.
- The supplier opens `/supplier/setup?token=…`, confirms the email the link was sent to and
  chooses a password.
- Supplier **Forgot password?** emails a reset link (rate limited) with the same neutral message.

## Link rules

- Single use; a used, replaced or expired link is rejected.
- Default lifetimes: setup 7 days, reset 24 hours. Users with **Manage users** can change the
  internal defaults (User Management › link expiry) and users with **Manage suppliers** the
  supplier defaults (Supplier Management › link expiry). Allowed values: 30 minutes, 1/4/12/24
  hours, 2/3/7 days. New values apply to links issued afterwards; existing links keep theirs.
- Internal tokens are stored only as SHA-256 digests. Unexpired legacy links remain usable until
  replaced.

## LAN demo

1. Run `ipconfig` and find the active adapter's IPv4 address. Addresses can change.
2. Set backend `.env`: `FRONTEND_URL=http://<LAN-IP>:5173` (links in emails use it).
3. Restart FastAPI from `backend`:
   `.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000`.
4. Restart Vite from `frontend`: `npm.cmd run dev`. Vite listens on all interfaces, port 5173,
   and proxies the API, so LAN clients only need port 5173.
5. Open `http://<LAN-IP>:5173` on a second device. If unreachable, check network routing and the
   Windows Firewall rule for Node. Do not disable the firewall or expose the database.
6. Create a test user with a mailbox you can read, open the emailed link on that device, set a
   password, sign in, then check that reusing the link fails.

## Production

Host the frontend and API at the approved HTTPS address, set
`FRONTEND_URL=https://your-portal.company.com` and restart the backend. Use the production reverse
proxy for `/api/v1`; do not deploy Vite's development server. Keep reset URL query strings out of
proxy access logs. The frontend uses the `no-referrer` policy so token-bearing URLs are not sent
as referrers.

## Automated tests

From `backend`, without touching the application database:

```powershell
.\.venv\Scripts\python.exe -m pytest --noconftest -p isolated_tests.support isolated_tests tests/api/test_password_reset.py tests/api/test_users.py -q -p no:cacheprovider
```

The `isolated_tests.support` plugin creates and disposes a temporary SQLite database and provides
the `issued_links` fixture, which records every link the app issues (tests read links there
because the API never returns them). Run `alembic upgrade head` before starting an updated
backend; the current head is `a1c3e5f7b902`.
