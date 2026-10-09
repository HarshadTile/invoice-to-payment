Supplier mobile OTP login
=========================

Apply the schema with `alembic upgrade head` before enabling OTP. Set
`SUPPLIER_MOBILE_AUTH=true` in the backend environment. `false` keeps vendor-code-only
login. Internal authentication uses its existing flow. Enabling OTP rejects supplier
JWTs without the server-issued mobile verification claim. Rotating JWT_SECRET_KEY
invalidates all existing sessions, including internal sessions.

Set independent random `JWT_SECRET_KEY` and `SUPPLIER_OTP_SECRET` values of at least
32 characters. Keep these in the uncommitted backend .env. All backend workers must
share these secrets and the same database. OTP digests use HMAC-SHA256; plaintext
codes and full phone numbers are never stored in the challenge database.

Preferred local mobile source: `data/local-supplier-mobiles.xlsx` (ignored by Git).
Use a sheet named `vendors` with exactly one row per vendor and these text columns:

| SUPPLIER | SUPPLIER_MOBILE |
| --- | --- |
| TEST-VENDOR | +919000000001 |

Set `SUPPLIER_MOBILE_EXCEL_FILE=data/local-supplier-mobiles.xlsx` in private backend
.env. SUPPLIER is matched to the invoice dataset's vendor code, ignoring case and
surrounding whitespace. A phone update affects that vendor's login regardless of
how many invoice rows it has. This file controls only registered phone lookup; the
invoice dataset remains the source for valid vendor codes, supplier details and
invoice access. A row here cannot grant access to a vendor absent from the invoices.

Phone cells must be Text in +country-code format. Missing, numeric or invalid phones
and duplicate vendor rows block login. The file is reread on each login/resend, so
save it after edits. If this source is configured but unavailable, login is blocked;
it never falls back to a phone in the invoice file. Restart after changing .env or
installing code changes. Do not put personal numbers in shared/committed files.
Each vendor is resolved independently. Real vendor-master records can have different
numbers for every vendor; shared numbers in the local test file do not affect the
lookup logic or widen JWT access. Current test mappings are not migrated or rewritten
when the phone lookup adapter is replaced with the real data source.

For compatibility, omitting SUPPLIER_MOBILE_EXCEL_FILE keeps the original lookup
from SUPPLIER_MOBILE on invoice rows. In that mode every repeated row for a vendor
must have the same phone. SUPPLIER_INVOICE_EXCEL_FILE selects the invoice workbook;
it does not select the new mobile master. The invoice cache refreshes after saves.

Explicit local mock configuration:

    SUPPLIER_MOBILE_AUTH=true
    APP_ENV=development
    SUPPLIER_SMS_MODE=mock

The mock sends no SMS. Use a debugger attached to the backend worker to inspect
`app.services.supplier_sms.local_mock_sender._outbox[challenge_id][0]` after Continue.
The private outbox holds codes in process memory for five minutes, has no HTTP
endpoint, and is never logged. Expired entries are pruned on the next mock send.
It is available only with the explicit development
and mock settings; production deployments must set APP_ENV=production.

Real SMS through 2Factor:

    SUPPLIER_MOBILE_AUTH=true
    SUPPLIER_SMS_MODE=2factor
    TWOFACTOR_API_KEY=your_private_api_key
    TWOFACTOR_OTP_TEMPLATE=SupplierLoginOTP

The approved template name is case-sensitive and must match the provider dashboard.
Its XXXX placeholder is replaced with the application's own six-digit code. The
template's approved Sender ID (for example INVPAY) is managed by 2Factor, rather than
supplied separately by the application. This adapter accepts Indian mobile numbers
in +91 format and uses the manual OTP SMS API. Verification, expiry, single use and
JWT issuance remain enforced by this backend; provider-generated codes are not used.

This legacy manual-OTP endpoint does not document a client-side SMS-only switch.
An account's delivery routing may send a voice call instead. Template approval alone
does not confirm SMS delivery or disable voice fallback. If this happens, ask 2Factor
support to enable text SMS for the manual OTP API and disable voice delivery/fallback.
Ask whether that route works with existing free credits before approving any payment.
Current API reference: https://documenter.getpostman.com/view/301893/TWDamFGh.

Before enabling real SMS, apply the migration, configure JWT_SECRET_KEY and
SUPPLIER_OTP_SECRET, prepare the local workbook, then restart the backend. Saving an
API key alone does not enable OTP authentication. With real delivery enabled,
Continue and Resend send actual SMS and may consume provider credits. Free trial
eligibility, delivery permissions and balance are controlled by 2Factor; this app
cannot guarantee free delivery. No provider request is made during automated tests.

Requests use HTTPS with a ten-second timeout, a fixed provider host, and no redirect
following or automatic retries. A non-success HTTP/JSON response or a timeout blocks
login; no direct login or mock fallback occurs. The provider's Success response means
the request was accepted, not proof that the handset received it. Raw provider errors
are never returned or logged. The provider API carries the key, full phone and code
in its URL, so do not enable HTTP wire debugging or URL capture in external tracing
for this sender. No secrets belong in frontend settings, docs or tracked files.

Provider references:
https://2factor.in/API/DOCS/SMS_OTP.html and
https://dial2verify.com/corp/support-system/tkt/knowledgebase.php?article=21.
Other sender modes return an error; they never allow direct login when OTP is enabled.

Codes last five minutes and can be used once. Resend replaces the challenge/code.
Cancel invalidates the active code. Limits are five sends and five verification
attempts per vendor per 15-minute window, with 60 seconds between sends. Starting
over, resending, or cancelling does not reset limits. The client IP is also limited
to 20 sends and 50 attempts per window. Configure Uvicorn trusted proxy addresses
explicitly if deployed behind a proxy; never trust arbitrary forwarding headers.
Database writes serialize verification and quota updates across workers. Rate-limit
rows are retained so process restarts cannot reset limits. Apply normal database
access restrictions and retention practices.

SMS delivery reserves quota and a pending challenge in a short transaction, releases
database locks before calling the provider, then activates the challenge in another
short transaction. Pending challenges cannot be verified. Provider failure consumes
the reserved quota and invalidates the code. Cancellation or replacement during
delivery cannot be reversed by a late provider response. The five-minute lifetime
starts after the provider accepts delivery. MySQL lock timeouts/deadlocks return a
retryable login error. There is no automatic SMS retry.

Each new challenge also stores a keyed fingerprint of its registered phone. Verify
rereads the vendor's current phone and rejects the challenge if that phone changed.
No full phone number is stored in the challenge or JWT. Restart all backend workers
after deploying this change. Older pending codes without a phone fingerprint require
a fresh login; existing signed-in sessions retain their existing JWT expiry policy.

OTP timing columns must be DOUBLE precision on MySQL. Run `alembic upgrade head`
to apply the timestamp precision fix (revision d9f0a1b2c347). The migration invalidates
pending challenges with previously rounded timestamps and preserves quota counts.
After updating, cancel any open OTP popup and start a new login request.

Run the isolated backend suite from backend with
`.venv/Scripts/python.exe -m pytest otp_tests -q -p no:cacheprovider` on Windows.
It uses synthetic phone numbers and SQLite and does not invoke the legacy MySQL
test database reset fixture. Run `npm.cmd test` and `npm.cmd run build` from frontend.
To include the MySQL precision regression, set RUN_MYSQL_OTP_TESTS=true for the test
process. It reads SUPPLIER_OTP_MYSQL_TEST_URL or the local backend .env database
connection and uses only a temporary
table with synthetic identities and a mock sender. The concurrency tests use uniquely
named otp_load_probe_ scratch tables shared by separate MySQL connections and remove
them afterward. They send no messages and do not modify application records or reset
the database.

The implementation follows the short expiry, single-use, secret handling and
attempt-limit guidance at https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html.
