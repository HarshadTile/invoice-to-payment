"""Builds the manual test-case workbook for Mahindra I2P (Invoice Tracker).

Every case is taken from the application code (routes, guards, validation messages,
permission matrix and ticket state machine). Run: python build_testcases.py <out.xlsx>
"""
import sys
from math import ceil

from openpyxl import Workbook
from openpyxl.formatting.rule import CellIsRule, FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

PRI_ORDER = {'High': 0, 'Medium': 1, 'Normal': 2}


def tc(pri, name, pre, steps, exp):
    return (pri, name, pre, steps, exp)


# ---------------------------------------------------------------- shared preconditions
APP = 'Application running; tester has the sign-in page URL.'
SUP = 'Active supplier account (email + password set) with at least 2 vendor codes that have invoices in several statuses.'
SUP_NEW = 'Email address that has no supplier account and no pending request; valid PAN and vendor code(s) present in invoice data.'
ADMIN = 'Signed in as an active Admin with Portal / Team = All channels (HQ).'
PO_USER = 'Active internal user authorised for PO Portal (e.g. Invoice Team L2, Ticket Role Channel Lead) signed in with Portal / Team = PO Portal.'
SRM_USER = 'Active internal user authorised for Msetu / SRM (e.g. Invoice Team L2, Ticket Role Channel Lead) signed in with Portal / Team = Msetu / SRM.'

# ================================================================ SUPPLIER A-Z
SUPPLIER = [
    # --- High
    tc('High', 'Login – valid supplier email and password', APP + ' ' + SUP,
       ['Open the sign-in page (Supplier tab is selected).', 'Enter the registered Email and correct Password.', 'Click Continue.'],
       'Supplier Dashboard (/supplier/dashboard) opens. Company name is shown in the top bar and only the supplier\'s vendor codes are listed.'),
    tc('High', 'Login – wrong password', APP + ' ' + SUP,
       ['Enter the registered Email.', 'Enter a wrong Password.', 'Click Continue.'],
       'Sign-in is refused with "Email or password is incorrect, or the account is inactive." User stays on the sign-in page.'),
    tc('High', 'Login – unregistered email does not reveal account existence', APP,
       ['Enter an email that has no supplier account.', 'Enter any password.', 'Click Continue.'],
       'Same generic message "Email or password is incorrect, or the account is inactive." (no hint that the email is unknown).'),
    tc('High', 'Login – deactivated supplier cannot sign in', APP + ' Supplier account Deactivated in Supplier Management.',
       ['Enter the deactivated supplier\'s Email and correct Password.', 'Click Continue.'],
       'Sign-in is refused with the generic message. No dashboard is shown.'),
    tc('High', 'Login – account lock after 5 wrong passwords (boundary)', APP + ' ' + SUP,
       ['Enter a wrong password 4 times, then the correct password.', 'Log out. Enter a wrong password 5 times in a row.',
        'Now enter the CORRECT password and click Continue.', 'Wait 15 minutes and sign in with the correct password.'],
       '4 wrong attempts: the correct password still signs in (counter resets). After the 5th wrong attempt the account is locked: even the correct password shows "Too many wrong attempts. Try again in 15 minutes." After 15 minutes the correct password signs in. A failed-login event is visible in Audit Logs.'),
    tc('High', 'Login – mandatory field validation', APP,
       ['Leave Email and Password empty and click Continue.', 'Enter Email only and click Continue.'],
       'Inline messages "Enter your email address." and "Enter your password." appear; no request is sent.'),
    tc('High', 'Request an account – valid submission', APP + ' ' + SUP_NEW,
       ['On the sign-in page click Request an account.', 'Enter Company, Email, PAN (e.g. ABCDE1234F) and Vendor codes; leave Note blank.', 'Click Submit request.'],
       '"Request submitted" dialog appears and a confirmation email is received. HQ Supplier Management › Access requests shows the request as Pending with a notification to the reviewers.'),
    tc('High', 'Request an account – mandatory fields', APP,
       ['Open Request an account.', 'Click Submit request with all fields empty.', 'Fill fields one by one and resubmit each time.'],
       'Messages shown per field: "Enter your company name.", "Enter a valid email address.", "Enter your 10-character PAN, like ABCDE1234F.", "Enter at least one vendor code." Note is optional and never blocks submission.'),
    tc('High', 'Request an account – PAN format and length (boundary)', APP + ' ' + SUP_NEW,
       ['Enter PAN with 9 characters (ABCDE1234) and submit.', 'Enter 11 characters (ABCDE1234FG) and submit.',
        'Enter wrong pattern (12345ABCDE) and submit.', 'Enter a valid 10-character PAN (ABCDE1234F) and submit.'],
       'Steps 1–3 show "Enter your 10-character PAN, like ABCDE1234F." and no request is created. Step 4 is accepted.'),
    tc('High', 'Request an account – email already has a supplier account', APP + ' Email of an existing supplier account.',
       ['Open Request an account and fill all fields using the existing supplier\'s email.', 'Submit.'],
       '"This email already has a supplier account. Sign in, or use Forgot password." No new request is created.'),
    tc('High', 'Request an account – duplicate pending request', APP + ' A request from this email is already Pending.',
       ['Submit a second request with the same email.'],
       '"A request from this email is already waiting for review." Only one Pending request exists for the email.'),
    tc('High', 'Set password from approval email – happy path', 'Access request approved by the team; setup email received.',
       ['Click the link in the email.', 'Enter the same Email, a New password of 8+ characters and the same Confirm password.', 'Click Set password and continue.', 'Sign in with the new email/password.'],
       'Password is saved, user is taken to supplier sign-in and can log in. Supplier status changes from Invited to Active in Supplier Management.'),
    tc('High', 'Set password – link can be used only once', 'Setup link already used successfully.',
       ['Open the same setup link again.'],
       '"This link is invalid or has expired. Ask the team for a new one." Password form cannot be submitted.'),
    tc('High', 'Set password – expired link', 'Supplier invite link expiry set to 30 minutes (Supplier Management › link expiry); new setup email sent.',
       ['Wait more than 30 minutes.', 'Open the setup link.'],
       '"This link is invalid or has expired. Ask the team for a new one."'),
    tc('High', 'Set password – email does not match the link', 'Valid unused setup link.',
       ['Open the link.', 'Enter a different email address, valid password and confirmation.', 'Submit.'],
       '"That email doesn\'t match this link." Password is not set.'),
    tc('High', 'Set password – password length boundary', 'Valid unused setup link.',
       ['Enter a 7-character password (and same confirmation) and submit.', 'Enter exactly 8 characters and submit.'],
       '7 characters: "Password must be at least 8 characters." 8 characters: accepted.'),
    tc('High', 'Set password – confirmation mismatch', 'Valid unused setup link.',
       ['Enter password "Mahindra@1" and confirmation "Mahindra@2".', 'Submit.'],
       '"Passwords don\'t match." Password is not set.'),
    tc('High', 'Data isolation – supplier sees only own vendor codes', SUP + ' Another supplier exists with different codes.',
       ['Sign in as supplier A.', 'Open My Invoices with All vendor codes.', 'Search an invoice number that belongs to supplier B.',
        'Compare the list with HQ Supplier Visibility for supplier A.'],
       'Only supplier A\'s invoices appear; supplier B\'s invoice is not found. Counts match HQ Supplier Visibility for supplier A.'),
    tc('High', 'Security – supplier cannot open internal pages by URL', 'Signed in as a supplier.',
       ['Type /app/invoices in the address bar.', 'Type /app/settings/users.', 'Type /app/inquiry-desk.'],
       'Internal pages never load. Supplier is redirected to the Dashboard with "You\'re signed in as a supplier. You\'ve been redirected to your Dashboard…"'),
    tc('High', 'Raise a Query – valid submission', 'Signed in as a supplier; invoice of own vendor code available.',
       ['Open an invoice and click Raise a Query.', 'Select Topic "Payment Not Received" and Priority "High".', 'Enter Subject and Details.', 'Click Submit Query.'],
       'Query is created with status Open and appears in My Queries. It appears in the Inquiry Desk of the invoice\'s channel (SRM or PO Portal) and in HQ.'),
    tc('High', 'Raise a Query – subject and details mandatory', 'Raise a Query dialog open.',
       ['Leave Subject and Details empty; click Submit Query.', 'Fill Subject only; submit.'],
       '"Enter a subject and description." Query is not created.'),
    tc('High', 'Query – internal notes are hidden from supplier', 'Team member added an Internal note and a Public reply on the supplier\'s query.',
       ['Open the query in My Queries.'],
       'Only the Public reply is visible. The internal note text is not shown anywhere on the supplier side.'),
    tc('High', 'Dashboard – KPI counts match My Invoices', SUP,
       ['Select an FY and All vendor codes.', 'Note Total Invoices, In Progress, Awaiting Payment, Fully Paid, Rejected.', 'Click each card and count rows in My Invoices.'],
       'Each card opens My Invoices filtered to that group and the row count equals the card value.'),
    tc('High', 'Invoice details – Paid invoice shows full progress and UTR', 'Supplier has a Paid invoice.',
       ['Click the Paid invoice number.'],
       'Invoice Progress shows Initial → Invoice Uploaded → Pending for Approval → Approved → Miro Booked → Paid all complete; Payment Date and UTR No. are shown.'),
    tc('High', 'Invoice details – Rejected invoice shows reason', 'Supplier has a Rejected invoice.',
       ['Open the Dashboard and check Needs attention.', 'Open the rejected invoice.'],
       'Invoice is listed in Needs attention with Raise a query. Details show status Rejected and the rejection reason.'),
    tc('High', 'Logout', 'Signed in as a supplier.',
       ['Click Logout and confirm Log Out.', 'Press the browser Back button.'],
       'User returns to the sign-in page. Back does not reopen the dashboard; protected pages redirect to sign-in.'),
    # --- Medium
    tc('Medium', 'Forgot password – registered supplier', APP + ' ' + SUP,
       ['Click Forgot password? on the Supplier tab.', 'Enter the Sign-in email; click Send reset email.', 'Open the email link, set a new password (8+), sign in.'],
       'Message "If an active supplier account matches that email, a password reset link will be sent." Email received; new password works and the old one is rejected.'),
    tc('Medium', 'Forgot password – unknown email gives same response', APP,
       ['Enter an email with no supplier account; Send reset email.'],
       'Same generic message as for a real account; no email is sent.'),
    tc('Medium', 'Forgot password – rate limit (6th request in 15 min)', APP + ' ' + SUP,
       ['Send reset email for the same address 5 times.', 'Send a 6th time within 15 minutes.'],
       'The 6th request shows "Too many requests. Please try again a little later."'),
    tc('Medium', 'Request an account – rate limit per network', APP,
       ['Submit 5 account requests (different emails) from the same machine within one hour.', 'Submit a 6th.'],
       '6th submission shows "Too many requests. Please try again a little later."'),
    tc('Medium', 'Request an account – vendor code separators', APP + ' ' + SUP_NEW,
       ['Enter vendor codes separated by comma and spaces, e.g. "11111, 22222 33333".', 'Submit.', 'Open the request in Supplier Management › Review.'],
       'All three codes are captured as separate codes in the request.'),
    tc('Medium', 'Request an account – vendor code limits (boundary)', APP + ' ' + SUP_NEW,
       ['Enter 51 vendor codes and submit.', 'Enter one code of 33 characters and submit.', 'Enter 50 codes and one code of 32 characters and submit.'],
       '51 codes: "Enter at most 50 vendor codes." 33 characters: "A vendor code is at most 32 characters." 50 codes / 32 characters: accepted.'),
    tc('Medium', 'Request rejected by the team – supplier email', 'Supplier submitted a request.',
       ['Team rejects it with reason "Details don\'t match our records" and a message.', 'Check supplier mailbox.'],
       'Supplier receives a rejection email containing the reason and the message.'),
    tc('Medium', 'Remember me on this device', APP + ' ' + SUP,
       ['Sign in with Remember me unticked; close all browser windows; reopen the app.', 'Repeat with Remember me ticked.'],
       'Unticked: user must sign in again. Ticked: user stays signed in.'),
    tc('Medium', 'Top bar – FY filter', SUP,
       ['Change FY to a different year, then to All Years.', 'Visit Dashboard, My Invoices and Logs.'],
       'All pages show only invoices of the chosen FY; All Years shows everything.'),
    tc('Medium', 'Top bar – vendor code selector', SUP,
       ['Select one vendor code.', 'Then select All vendor codes.'],
       'Dashboard and My Invoices show only that code\'s invoices; All vendor codes shows all of the supplier\'s codes.'),
    tc('Medium', 'Dashboard – money tiles', SUP,
       ['Check Amount received, Outstanding, Overdue and Avg. days to payment.', 'Compare with exported My Invoices data.'],
       'Values agree with the invoice data for the selection; no blank, NaN or "undefined" values.'),
    tc('Medium', 'Dashboard – chart click-through', SUP,
       ['Click a month bar in Monthly invoices.', 'Return and click a status in Where my invoices are.'],
       'My Invoices opens filtered to that month / status respectively.'),
    tc('Medium', 'Dashboard – Upcoming and Recent payments lists', 'Supplier has invoices due in the next 30 days and recently paid invoices.',
       ['Check Upcoming payments.', 'Check Recent payments.'],
       'Upcoming payments lists only invoices due in the next 30 days. Recent payments shows paid invoices with UTR.'),
    tc('Medium', 'My Invoices – Status filter with counts', SUP,
       ['Open the Status chip.', 'Choose each status one by one.'],
       'Each option shows a count; the list shows only that status and the count matches. All Statuses restores the full list.'),
    tc('Medium', 'My Invoices – Date type and date range', SUP,
       ['Choose Date = Invoice date and set From / To.', 'Change Date to Upload date with the same range.', 'Try to pick a To date earlier than From.'],
       'List changes to the chosen date field. The To picker does not allow a date before From.'),
    tc('Medium', 'My Invoices – All dates and Clear', 'Status and date filters applied.',
       ['Click All dates.', 'Apply filters again and click Clear.'],
       'All dates removes only the date range; Clear removes every filter and Date returns to Invoice date.'),
    tc('Medium', 'My Invoices – search by invoice number and commas', SUP,
       ['Type part of an invoice number.', 'Type "<invoice no>, <PO no>".'],
       'Partial text matches; comma search matches invoice then PO by position.'),
    tc('Medium', 'My Invoices – no matching results', SUP,
       ['Search "ZZZ-NOT-EXISTING".'],
       'Clear empty state is shown (no error), with a way to clear filters.'),
    tc('Medium', 'Export to Excel – filtered list', SUP,
       ['Apply a Status filter.', 'Click Export to Excel (N).', 'Open the file.'],
       'File downloads with a timestamped name; row count equals N and only filtered invoices are included.'),
    tc('Medium', 'Export to Excel – selected rows', SUP,
       ['Tick 3 rows.', 'Click Export Selected to Excel.'],
       'File contains exactly the 3 selected invoices.'),
    tc('Medium', 'Invoice details – unpaid invoice UTR', 'Invoice in Approved or Miro Booked.',
       ['Open the invoice.'],
       'UTR shows "Not yet visible". Current step shows "In progress".'),
    tc('Medium', 'Invoice details – View Full Detail', SUP,
       ['Open an invoice; click View Full Detail.'],
       'Full detail page opens with all supplier-visible fields for that invoice.'),
    tc('Medium', 'Raise a Query – from invoice list flag icon', SUP,
       ['In My Invoices click the flag icon on a row.'],
       'Raise a Query opens with that invoice pre-selected.'),
    tc('Medium', 'Raise a Query – Topic and Priority options', 'Raise a Query dialog open.',
       ['Open Topic list.', 'Open Priority list.'],
       'Topics: Invoice Status Stuck, Payment Date Enquiry, Payment Not Received, Amount Mismatch, PO / GRN Issue, Invoice Rejected, Bank / GST Detail Change, Invoice Missing or Duplicate, Other. Priority: Low, Medium, High (no Urgent).'),
    tc('Medium', 'Raise a Query – attachment size boundary', 'Files of 4.9 MB, 5.0 MB and 5.1 MB.',
       ['Attach 4.9 MB file and submit.', 'Attach exactly 5 MB file and submit.', 'Attach 5.1 MB file and submit.'],
       '4.9 MB and 5 MB accepted. 5.1 MB shows "Attachment must be 5 MB or smaller."'),
    tc('Medium', 'Raise a Query – attachment file types', 'Sample files: .pdf .png .jpg .jpeg .xlsx .csv .docx .exe .zip.',
       ['Attach each allowed type and submit.', 'Attach .exe and .zip.'],
       'Allowed types upload successfully. .exe / .zip are rejected with an error and the file is not stored.'),
    tc('Medium', 'Raise a Query – subject length boundary', 'Raise a Query dialog open.',
       ['Paste 151 characters into Subject.'],
       'Only 150 characters are accepted.'),
    tc('Medium', 'My Queries – reply while Open / In Progress', 'Supplier query in Open or In Progress.',
       ['Open the query; type in Write a reply; click Send.'],
       'Reply appears in the conversation and is visible to the team in Inquiry Desk.'),
    tc('Medium', 'My Queries – Close a resolved query', 'Team resolved the query.',
       ['Open the query; click Close.'],
       'Status becomes Closed; reply box is no longer available.'),
    tc('Medium', 'My Queries – Reopen a resolved query', 'Team resolved the query.',
       ['Click Reopen; enter a reason; confirm.'],
       'Status becomes In Progress; the reason is recorded; team is notified.'),
    tc('Medium', 'My Queries – actions blocked in wrong status', 'One query Open, one Closed.',
       ['Check Close/Reopen on the Open query.', 'Check reply box on the Closed query.'],
       'Close/Reopen only appear when Resolved. Closed query cannot be replied to.'),
    tc('Medium', 'My Queries – status cards filter', 'Supplier has queries in several statuses.',
       ['Click Open, In Progress and Resolved / Closed cards.'],
       'List filters to each group and counts match.'),
    tc('Medium', 'Notifications – reply notification and Mark all read', 'Team replied to supplier query.',
       ['Check bell count.', 'Open Notifications; use All / Unread and search.', 'Click Mark all read.'],
       'Bell shows unread count; filters work; after Mark all read count is cleared.'),
    tc('Medium', 'My Profile – details shown', SUP,
       ['Open My Profile.'],
       'Sign-in email, PAN and vendor codes are shown correctly.'),
    tc('Medium', 'Profile – request to add a vendor code', SUP,
       ['My Profile › Vendor code access › Request a change.', 'Enter a code in Vendor codes to add; write a Note; Send request.'],
       'Status shows "Waiting for review". Request appears in Supplier Management › Access requests.'),
    tc('Medium', 'Profile – change request validations', SUP,
       ['Open Request a change; leave add and remove empty; send.', 'Enter a code but leave Note empty; send.'],
       '"Enter a vendor code to add or pick one to remove." Note is required and blocks sending.'),
    tc('Medium', 'Profile – only one pending change request', 'A change request is Waiting for review.',
       ['Try to send another change request.'],
       'Not allowed: "You already have a request waiting for review." (or the action is unavailable).'),
    tc('Medium', 'Profile – approved change applies codes', 'Team applied the change request.',
       ['Refresh; open vendor code selector and My Invoices.'],
       'Added code appears and its invoices are visible; removed code and its invoices disappear. Status shows Approved.'),
    tc('Medium', 'Logs – timeline, filter, export', SUP,
       ['Open Logs.', 'Filter by type and search an invoice.', 'Export to CSV.'],
       'Timeline shows invoice, payment and query events for own codes only; CSV contains the filtered rows.'),
    tc('Medium', 'Help icon opens Vendor View manual', 'Signed in as a supplier (also check on the sign-in page).',
       ['Click the Help (?) icon in the top bar.'],
       'Vendor View user manual PDF (vendor-view.pdf) opens. Repeated clicks do not stack toasts.'),
    tc('Medium', 'Supplier deactivated during session', 'Supplier signed in; HQ then deactivates the account.',
       ['Refresh or navigate to another page.'],
       'Supplier can no longer use the portal and is returned to sign-in.'),
    # --- Normal
    tc('Normal', 'Old supplier login URL redirect', APP,
       ['Open /supplier/login.'],
       'Redirected to the sign-in page with the Supplier tab selected.'),
    tc('Normal', 'Session expiry', 'Supplier signed in; token expired (or cleared by tester).',
       ['Click any menu item.'],
       'User is sent back to sign-in with "Your session has ended. Please sign in again." (no blank page).'),
    tc('Normal', 'Supplier with no invoices', 'Active supplier whose codes have no invoices in the chosen FY.',
       ['Open Dashboard and My Invoices.'],
       'Zero values and empty states shown; no NaN, "undefined" or broken charts.'),
    tc('Normal', 'Regression – KPI share text without < / > signs', 'Data where a status share is below 1% or 0.1%.',
       ['Check the share text under the KPI cards.'],
       'Shows business wording such as "under 0.1%" or "0.8% of invoices"; no "<" or ">" characters.'),
    tc('Normal', 'Regression – owner avatar initials', 'Supplier query owned by "Msetu / SRM team".',
       ['Open My Queries and check the Owner column avatar.'],
       'Avatar shows "MS" (not "M/"). PO Portal team shows "PP".'),
    tc('Normal', 'Auto-close of resolved query', 'Query Resolved and no supplier action for 5 days (AUTO_CLOSE_DAYS = 5); scheduled job running.',
       ['After 5 days open the query.'],
       'Query status is Closed automatically.'),
    tc('Normal', 'Phone-width layout', 'Browser width about 375 px.',
       ['Sign in; open Dashboard, My Invoices, My Queries.'],
       'No horizontal page scroll; top bar items fit; menu can be opened and closed.'),
    tc('Normal', 'Special characters and long names', 'Supplier company name with & / . and 60+ characters.',
       ['Sign in and view top bar, profile and exported file.'],
       'Name displays correctly (wrapped or truncated with tooltip), and exports without broken characters.'),
    tc('Normal', 'Password field masking', APP,
       ['Type a password on sign-in, setup and reset pages.'],
       'Characters are masked.'),
]

# ================================================================ ALL CHANNEL (HQ) A-Z
HQ = [
    # --- High
    tc('High', 'Login – Admin into All channels (HQ)', APP + ' Active Admin account.',
       ['Click Internal Team.', 'Portal / Team = All channels (HQ).', 'Enter Email ID and Password; click Continue.'],
       'Invoice Tracking dashboard opens; Channel filter shows All Channels; menu shows Processing Channels, Supplier Visibility, Reports & admin, Settings.'),
    tc('High', 'Login – wrong password', APP,
       ['Internal Team; enter valid email and wrong password; Continue.'],
       '"Invalid email or password." No session is created; a Failed login entry appears in Audit Logs.'),
    tc('High', 'Login – non-Admin user cannot choose HQ', APP + ' Active Invoice Team L3 user authorised for Msetu / SRM.',
       ['Internal Team; Portal / Team = All channels (HQ); valid credentials; Continue.'],
       '"This account can only sign in to its assigned portal." Sign-in refused.'),
    tc('High', 'Login – invited user who has not set a password', APP + ' User created but setup link not used.',
       ['Sign in with that email and any password.'],
       '"This account hasn\'t been activated yet. Use your password setup link, or ask an administrator for a new one."'),
    tc('High', 'Login – deactivated internal user', APP + ' User status Inactive.',
       ['Sign in with correct credentials.'],
       '"This account has been deactivated. Contact an administrator."'),
    tc('High', 'First-time setup from Welcome email', 'New user created by Admin; Welcome email received.',
       ['Click Set Your Password in the email.', 'Enter a password of 8+ characters twice; save.', 'Sign in.'],
       'Password saved; user can sign in; status changes Invited → Active in User Management.'),
    tc('High', 'Dashboard – KPI cards match search results', ADMIN,
       ['Set FY and All Channels.', 'Note Total Invoices, Pending Approval, Approved, Miro Booked, Paid.', 'Click each card.'],
       'Each card opens Search Invoice(s) filtered to that status and the result count equals the card value. Amounts shown when on record.'),
    tc('High', 'Top bar – Channel filter', ADMIN,
       ['Change Channel from All Channels to Msetu / SRM, then PO Portal.'],
       'Dashboard, charts and search show only the chosen channel\'s invoices; totals change accordingly.'),
    tc('High', 'Search Invoice(s) – single term', ADMIN,
       ['Open Search Invoice(s).', 'Type a full invoice number.', 'Type a PO number, then a UTR, then an amount.'],
       'Each search returns the matching invoice(s) from any table field.'),
    tc('High', 'Search Invoice(s) – comma positional search', ADMIN + ' Invoice with known invoice, PO, item and UTR.',
       ['Type "<invoice>, <PO>".', 'Type "<invoice>, <PO>, <item>, <UTR>".', 'Type the same values in the wrong order.'],
       'Hints show "+ PO with comma", "+ PO item with comma", "+ UTR with comma". Correct order finds the invoice; wrong order returns no match.'),
    tc('High', 'Invoice details popup', ADMIN,
       ['Click an invoice number (or eye icon).'],
       'Popup shows Status, channel with "Why this channel", Currently Handled By (or "Not assigned"), Invoice Progress, Status & payment (UTR), Dates (Invoice, Upload, Payment Due, Payment).'),
    tc('High', 'Export – visible only with Export data permission', ADMIN + ' A test role without Export data.',
       ['As Admin export from Search Invoice(s).', 'Sign in as a user whose role lacks Export data.'],
       'Admin: Export to Excel (N) downloads N rows. User without permission: no Export button anywhere.'),
    tc('High', 'Supplier Management – approve access request', ADMIN + ' Pending supplier access request.',
       ['Settings › Supplier Management › Access requests.', 'Click Review; check Match with invoice data (Found / Not found).', 'Tick vendor codes; click Approve & send setup email.'],
       'Request becomes Approved; supplier account created with status Invited; supplier receives setup email; requests count decreases.'),
    tc('High', 'Supplier Management – reject access request', ADMIN + ' Pending request.',
       ['Review › Reject…', 'Pick reason "Vendor not in our system yet", add message.', 'Click Reject and email supplier.'],
       'Request becomes Rejected with the reason shown; supplier receives the rejection email.'),
    tc('High', 'Supplier Management – Add Supplier', ADMIN + ' Supplier in invoice data without a portal account.',
       ['Click Add Supplier.', 'Search by name, PAN or vendor code; pick supplier.', 'Enter contact email; tick codes; Create supplier.'],
       'Supplier listed with status Invited; setup email sent; toast confirms.'),
    tc('High', 'Supplier Management – Deactivate / Activate', ADMIN + ' Active supplier.',
       ['Click Deactivate on the supplier row.', 'Try supplier sign-in.', 'Click Activate; sign in again.'],
       'Inactive supplier cannot sign in; after Activate sign-in works.'),
    tc('High', 'User Management – Add User', ADMIN,
       ['Settings › User Management › Add User.', 'Full Name, Email, Application Role = Invoice Team L1, Ticket Role = Assignee, Channel = PO Portal.', 'Click Create User & Generate Link.'],
       'Toast "User created. Invitation email sent." User shows status Invited; Welcome email lists role, portal and Inquiry Desk access.'),
    tc('High', 'User Management – duplicate email', ADMIN + ' Existing user email.',
       ['Add User with an existing email; Create.'],
       '"An account with that email or login ID already exists." No duplicate user.'),
    tc('High', 'User Management – form validation', ADMIN,
       ['Add User with blank Full Name.', 'Invalid email "abc@".', 'Non-Admin role with no channel selected.'],
       '"Full name is required.", "Enter a valid email address.", "Select the channel this user can access."'),
    tc('High', 'User Management – last active Admin protection', 'Only one active Admin exists; signed in as that Admin.',
       ['Edit own user; set Status Inactive or role Invoice Team L1; save.'],
       '"This is the only active Admin. Make another user an active Admin first." Change not saved.'),
    tc('High', 'User Management – cannot remove own account', ADMIN,
       ['Hover the remove icon on own row.'],
       'Remove is disabled with tooltip "You can\'t remove your own account".'),
    tc('High', 'Roles & Permissions – remove a permission', ADMIN + ' Test user with role Invoice Team L2.',
       ['Untick Manage suppliers for Invoice Team L2.', 'Sign in (or refresh) as the L2 user.', 'Open /app/settings/suppliers by URL.'],
       'Supplier Management menu is gone and the URL redirects to the dashboard. API calls for supplier management return 403.'),
    tc('High', 'Roles & Permissions – Admin locked permissions', ADMIN,
       ['Try to untick Manage users, Configuration, Roles or Manage suppliers for Admin.'],
       'Checkboxes are disabled with tooltip "This permission is always enabled for Admin."'),
    tc('High', 'Portal Availability – disable a portal', ADMIN,
       ['Settings › Integration Settings › Portal Availability: switch PO Portal off.', 'Try PO Portal sign-in with a PO user.', 'Switch it back on.'],
       'PO sign-in shows "This portal is currently disabled. Contact your administrator." After re-enabling sign-in works.'),
    tc('High', 'Inquiry Desk – assign and resolve', ADMIN + ' Open supplier query.',
       ['Open Inquiry Desk; open the query.', 'Click Assign; pick a team member.', 'As assignee send Public reply; click Resolve with resolution note.'],
       'Status Open → In Progress on assign → Resolved; supplier sees the reply and the resolution.'),
    tc('High', 'Route protection when signed out', 'Not signed in.',
       ['Open /app/invoices, /app/settings/users directly.'],
       'Redirected to the sign-in page (Internal Team tab).'),
    # --- Medium
    tc('Medium', 'Forgot / reset password – internal', APP + ' Active internal user.',
       ['Forgot password? › Sign-in email › Send reset email.', 'Open link; set new password (8+) twice; sign in.'],
       'Generic message "If an active account matches that email, password reset instructions will be sent." Email received; new password works.'),
    tc('Medium', 'Reset password – validations and link reuse', 'Reset email received.',
       ['Enter 7 characters.', 'Enter mismatched confirmation.', 'Reset successfully, then open the same link again.'],
       '"Password must be at least 8 characters.", "Passwords don\'t match.", reused link: "This reset link is invalid or has expired. Request a new one."'),
    tc('Medium', 'Login – portal options failed to load', 'Backend stopped / network blocked.',
       ['Open the sign-in page, Internal Team.'],
       '"Unable to load portal options. Refresh the page to try again."'),
    tc('Medium', 'Top bar – FY filter and All Years', ADMIN,
       ['Switch FY; then All Years; visit Dashboard and Search.'],
       'All pages respect the chosen FY.'),
    tc('Medium', 'Top bar – Vendor Code filter', ADMIN,
       ['Type part of a vendor code; select it.', 'Clear it.'],
       'List is searchable; dashboard/search show only that vendor code; clearing restores all.'),
    tc('Medium', 'Dashboard – Invoices by channel Chart / Table', ADMIN,
       ['Toggle Chart and Table.'],
       'Both views show the same counts and values per channel.'),
    tc('Medium', 'Dashboard – Monthly invoices date type and click', ADMIN,
       ['Change the Date chip (e.g. Payment Due date).', 'Click a month.'],
       'Chart recalculates on the chosen date; clicking opens Search filtered to that month.'),
    tc('Medium', 'Dashboard – Invoice pipeline and Service vs Material', ADMIN,
       ['Click a status in Invoice pipeline.', 'Check Service vs Material totals.'],
       'Pipeline click opens filtered search; Service + Material counts equal the total in the selection.'),
    tc('Medium', 'Dashboard – Recent Invoices', ADMIN,
       ['Check the Recent Invoices widget; click one.'],
       'Latest 5 invoices shown; clicking opens its details.'),
    tc('Medium', 'Search – Status, Product and Date chips', ADMIN,
       ['Pick Status = Paid.', 'Product = Service.', 'Date = Approval date with a range.'],
       'Filters combine (AND); Date options: Invoice, Upload, Approval, MIRO booking, Payment Due, UTR clearing date.'),
    tc('Medium', 'Search – date range boundary', ADMIN,
       ['Set From = To = a date with known invoices.', 'Try To earlier than From.'],
       'Same-day range returns invoices of that date (inclusive). To cannot be before From.'),
    tc('Medium', 'Search – All dates / Clear', 'Filters applied.',
       ['Click All dates; then Clear.'],
       'All dates removes the range only; Clear resets all filters.'),
    tc('Medium', 'Search – no match', ADMIN,
       ['Search "NO-SUCH-INV-999".'],
       '"No invoices match" style empty state; no error.'),
    tc('Medium', 'Export – selected rows and file name', ADMIN,
       ['Tick rows; Export Selected to Excel.', 'Check file name and contents.'],
       'Only ticked rows exported; file name contains a timestamp.'),
    tc('Medium', 'Processing Channels pages from HQ', ADMIN,
       ['Open Processing Channels › Msetu / SRM, then PO Portal.'],
       'Each opens its own register with channel-specific columns, quick filters and History tab.'),
    tc('Medium', 'Supplier Visibility', ADMIN,
       ['Open Supplier Visibility; pick supplier by Supplier Name, then PAN, then Vendor Code.', 'Apply a status filter.'],
       'Shows Total Invoices, Paid, Open Queries, Total Invoice Amount and the supplier\'s invoice list; Filtered Invoice Amount equals sum of filtered rows.'),
    tc('Medium', 'Vendor code full page', ADMIN,
       ['Open a vendor code page (/app/vendor-code/<code>) from a link.'],
       'Vendor header with avatar initials, details and invoice log for the code.'),
    tc('Medium', 'Vendor Status Reports', ADMIN,
       ['Open Vendor Status Reports; search; tick rows; Export to Excel.'],
       'Cards Completed Invoices, Suppliers Covered, Paid Value, Top Supplier; only paid (UTR) invoices listed; export matches.'),
    tc('Medium', 'Logs / History', ADMIN,
       ['Open Logs / History; search an invoice; filter type Invoice / Payment / Query; date filter; Export (N).'],
       'Columns Date, Invoice No, Vendor Code, PO No, Type, Event, Performed By, Details; export has N rows.'),
    tc('Medium', 'Audit Logs', ADMIN,
       ['Perform a login, a failed login and a user edit.', 'Open Settings › Audit Logs; search; filter event type.'],
       'All three events are recorded with user and time; log is read-only.'),
    tc('Medium', 'Integration Settings – MFOX Portal', ADMIN,
       ['Check MFOX Portal is off by default.', 'Switch it on; check sign-in Portal / Team list and Add User channel options.'],
       'When on, MFOX Portal appears in both lists; when off it is hidden.'),
    tc('Medium', 'User Management – edit user', ADMIN + ' Active L1 user.',
       ['Edit user: change role to L2, Ticket Role to Channel Lead, channel to Msetu / SRM; Save Changes.'],
       'Toast "<name> updated."; row shows new role and channel; user gets new access after next sign-in/refresh.'),
    tc('Medium', 'User Management – Admin role fields', ADMIN,
       ['Add User; choose Application Role = Admin.'],
       'Ticket Role shows "Admin (inherited)" and channel "All Channels — HQ / Admin" (read-only).'),
    tc('Medium', 'User Management – send access email', ADMIN + ' One Invited and one Inactive user.',
       ['Click Send account setup or password reset email for the Invited user.', 'Check the icon for the Inactive user.'],
       'Toast "Access email sent to <email>."; icon disabled for Inactive user.'),
    tc('Medium', 'User Management – remove user', ADMIN + ' Test user.',
       ['Click remove; confirm Remove User.'],
       'Toast "<name> removed."; user can no longer sign in.'),
    tc('Medium', 'User Management – search and role filter', ADMIN,
       ['Search by name, email, role and channel.', 'Apply then remove a role filter.'],
       'Results filter correctly; Remove role filter restores the list.'),
    tc('Medium', 'Roles – create new role', ADMIN,
       ['Click New role; name "Invoice Team L4"; copy from L2; Create role.'],
       'Role column appears with the same permissions as L2; available in Add User role list.'),
    tc('Medium', 'Roles – name validations', ADMIN,
       ['New role "A".', 'New role "Admin".', 'New role "Invoice Team L1".', 'Name with "#" or "@".', 'Name of 40 characters.'],
       '"Enter a name of at least 2 characters.", "Admin is a reserved role name.", "A role named Invoice Team L1 already exists.", invalid-character message; 40 characters accepted (41st cannot be typed).'),
    tc('Medium', 'Roles – rename and delete', ADMIN + ' Role with 2 users.',
       ['Edit roles › Rename role.', 'Delete role without choosing a target.', 'Choose target L1; Delete role.'],
       'Rename keeps users. Delete blocked until a target is chosen ("Pick the role its 2 users should move to."); users moved to L1. Admin has no rename/delete.'),
    tc('Medium', 'Roles – keep at least one non-Admin role', 'Only Admin and one other role exist.',
       ['Delete the remaining non-Admin role.'],
       '"Keep at least one role besides Admin."'),
    tc('Medium', 'Password link expiry – internal and supplier', ADMIN,
       ['User Management › link expiry: set invite 30 minutes, reset 1 hour.', 'Supplier Management › link expiry: set different values.', 'Create a user and check email wording.'],
       'Options 30 minutes to 7 days only; values save separately for internal and supplier; email says "This link will expire in 30 minutes".'),
    tc('Medium', 'Supplier Management – KPI cards and search', ADMIN,
       ['Click Supplier accounts, Active, Invited, Pending requests cards.', 'Search by name, email, PAN, vendor code.'],
       'List filters to each group; search works on all four fields.'),
    tc('Medium', 'Supplier Management – request validations', ADMIN + ' Pending request.',
       ['Untick all codes; Approve.', 'Reject with reason "Other (write a note)" and no message.'],
       '"Tick at least one vendor code." / "Write a note for the supplier."'),
    tc('Medium', 'Add Supplier – validations', ADMIN,
       ['Create without picking a supplier.', 'Pick supplier, no codes.', 'Invalid email.', 'Email already used by another supplier.'],
       '"Search and pick a supplier first.", "Tick at least one vendor code.", "Enter a valid supplier contact email.", "<email> already has a supplier account. Each account needs its own email."'),
    tc('Medium', 'Supplier row actions', ADMIN + ' Active supplier with password set.',
       ['Edit supplier details (invalid email, no codes, then valid).', 'Send setup email.', 'Send password reset email.', 'Delete supplier.'],
       'Edit errors "Enter a valid contact email." / "Select at least one vendor code."; setup email: "This supplier has already set a password or is inactive. Use reset password instead."; reset email sent; delete removes (Admin only).'),
    tc('Medium', 'Inquiry Desk – cards, search, views', ADMIN,
       ['Click Open, In Progress, SLA Breached, Resolved / Closed cards.', 'Search by query no, invoice, vendor, subject, owner; All categories filter.', 'Switch List / Board.'],
       'Filters and views work; all channels\' queries are visible to Admin.'),
    tc('Medium', 'Inquiry Desk – internal note, reassign, priority', ADMIN + ' In Progress query.',
       ['Add Internal note.', 'Reassign to another user.', 'Change priority.'],
       'Note visible only to team; new assignee notified; priority change recalculates SLA due time.'),
    tc('Medium', 'Inquiry Desk – SLA breach', 'High priority query left unanswered beyond 4 hours (default SLA: High 4 h, Medium 24 h, Low 48 h).',
       ['Open Inquiry Desk.'],
       'Query counted in SLA Breached card.'),
    tc('Medium', 'Notifications, Profile, Logout', ADMIN,
       ['Open Notifications; Mark all read.', 'Open Profile.', 'Logout › Log Out.'],
       'Count clears; Profile shows name, email, role, portal access; logout returns to sign-in.'),
    tc('Medium', 'Help icon opens All Channels manual', ADMIN,
       ['Click Help (?) icon.'],
       'all-channels-hq.pdf opens in a new tab.'),
    # --- Normal
    tc('Normal', 'Regression – KPI share wording', ADMIN,
       ['Look at share text on KPI cards with very small shares.'],
       'Shows "under 0.1%" / "0.8% of invoices"; no "<" or ">".'),
    tc('Normal', 'Regression – initials avatars', ADMIN,
       ['Check Owner column in Inquiry Desk, Currently Handled By, Logs Performed By, user menu.'],
       '"Msetu / SRM team" shows MS; names show two initials (e.g. Priya Nair → PN).'),
    tc('Normal', 'Settings index and old URLs', ADMIN,
       ['Open /app/settings.', 'Open /app/sync-log and /app/suppliers.'],
       '/app/settings goes to the first allowed tab; /app/sync-log → Logs; /app/suppliers → Supplier Management.'),
    tc('Normal', 'Menu collapse and Back link', ADMIN,
       ['Click ☰ to collapse/expand menu.', 'Open an invoice page and click Back.'],
       'Menu toggles; Back returns to previous page.'),
    tc('Normal', 'Phone-width top bar', 'Browser width about 375 px; Admin signed in.',
       ['Open dashboard.'],
       'Top bar fits without overflow; no horizontal scroll.'),
    tc('Normal', 'Large export', ADMIN + ' All Years, All Channels.',
       ['Export to Excel the full list.'],
       'File downloads completely and opens in Excel; row count equals N.'),
    tc('Normal', 'No undefined / NaN on any page', ADMIN,
       ['Visit every menu page with All Years and with an FY that has no data.'],
       'No "undefined", "NaN" or blank cards; empty states are readable.'),
]


# ================================================================ CHANNEL SHEETS (PO / SRM)
def channel_cases(key, name, other, quick, approvals, history, pdf, user, extra_high, extra_medium):
    other_key = 'msetuSrm' if key == 'poPortal' else 'poPortal'
    rows = [
        tc('High', f'Login – {name} user into {name}', APP + f' Active internal user authorised for {name}.',
           ['Internal Team; Portal / Team = ' + name + '.', 'Enter Email ID and Password; Continue.'],
           f'"{name} Invoice Tracking" dashboard opens; Channel pill fixed to {name} with tooltip "Your scope is locked to this channel".'),
        tc('High', f'Login – {name} user chooses {other}', APP + f' Active {name} user.',
           [f'Portal / Team = {other}; valid credentials; Continue.'],
           '"This account can only sign in to its assigned portal." A Failed login entry is written to Audit Logs.'),
        tc('High', f'Login – {name} user chooses All channels (HQ)', APP + f' Active {name} user (not Admin).',
           ['Portal / Team = All channels (HQ); Continue.'],
           '"This account can only sign in to its assigned portal."'),
        tc('High', f'Login – {name} portal disabled', APP + f' Admin switched {name} off in Portal Availability.',
           [f'Sign in to {name}.'],
           '"This portal is currently disabled. Contact your administrator."'),
        tc('High', 'Data scope – only this channel\'s invoices', user + f' A known {other} invoice number.',
           ['Check dashboard KPIs and Invoices by channel.', f'Search Invoice(s) for the {other} invoice number.'],
           f'Only {name} data is counted; Invoices by channel shows only {name}; the {other} invoice is not found.'),
        tc('High', f'Security – cannot open {other} channel page by URL', user,
           [f'Type /app/channel/{other_key} in the address bar.'],
           f'User is redirected to /app/channel/{key} ({name} page).'),
        tc('High', 'Security – HQ-only pages not reachable', user,
           ['Open /app/outputs, /app/logs, /app/supplier-visibility, /app/settings/users, /app/settings/roles by URL.'],
           'None of these pages load; user is redirected to the dashboard. Menu does not show Reports, Logs, Supplier Visibility or admin Settings.'),
        tc('High', f'{name} Invoice Register – loads and searches', user,
           [f'Click {name} in the menu.', f'Use "{CHANNEL_SEARCH[key]}" with an invoice number, vendor and PO.'],
           f'Register lists {name} invoices; search matches any field.'),
        tc('High', 'Invoice Register – quick filters', user,
           [f'Apply each quick filter: {quick}.', 'Combine two filters.'],
           'List narrows to matching invoices; combined filters apply together; clearing restores the list.'),
        tc('High', 'Inquiry Desk – Channel Lead sees only own channel', user + f' Queries exist in both {name} and {other}.',
           ['Open Inquiry Desk.', f'Open a {other} query by URL /app/inquiry-desk/<id>.'],
           f'Only {name} queries are listed; the {other} query cannot be opened.'),
        tc('High', 'Supplier Management – only own channel codes editable', user + ' (role with Manage suppliers). Pending request containing codes of both channels.',
           ['Settings › Supplier Management › Access requests › Review.'],
           f'Only {name} codes can be ticked; {other} codes show "Managed by the {other} team" and are locked.'),
        tc('High', 'Supplier Management – approve own channel codes', user + ' Pending request with own channel codes.',
           ['Tick own codes; Approve & send setup email.'],
           'Request Approved; supplier Invited and receives setup email.'),
        *extra_high,
        tc('Medium', 'Dashboard – KPI cards and charts', user,
           ['Check Total Invoices, Pending Approval, Approved, Miro Booked, Paid.', 'Click a card, a month and a pipeline status.'],
           f'Counts are {name}-only; clicks open Search Invoice(s) filtered accordingly.'),
        tc('Medium', 'Invoice Register – Columns presets', user,
           ['Click Columns; choose Standard, Approvals, All fields, then Custom and pick 3 columns.'],
           f'Each preset shows its column set (Approvals: {approvals}); Custom shows only the chosen columns.'),
        tc('Medium', 'Invoice Register – Status, Date chips and range', user,
           ['Pick a Status; pick Date type; set From/To; All dates; Clear.'],
           'Filters apply and reset correctly; To cannot be before From.'),
        tc('Medium', 'Invoice Register – View and invoice number open details', user,
           ['Click View on a row; close; click an invoice number.'],
           'Invoice details popup opens for the correct invoice both ways.'),
        tc('Medium', 'Invoice Register – Export to Excel', user,
           ['Apply a filter; Export to Excel (N).'],
           'File with N rows and the visible column set is downloaded.'),
        tc('Medium', 'Export hidden without permission', f'{name} user whose role has no Export data.',
           ['Open dashboard search and channel register.'],
           'No Export buttons are shown.'),
        tc('Medium', 'History tab', user,
           ['Open the History tab.', 'Search one invoice; set a date range.'],
           f'Timeline events: {history}. Filtered to the chosen invoice/date.'),
        tc('Medium', 'Search Invoice(s) – comma search and chips', user,
           ['Search "<invoice>, <PO>".', 'Apply Status / Product / Date filters.'],
           f'Correct {name} invoice found; filters work on {name} data only.'),
        tc('Medium', 'Supplier Management – already approved by other team', user + f' Request already approved by {other} team.',
           ['Open the request.'],
           'Message "Already approved by … Use Edit supplier to add your codes." Use Edit supplier to add own channel codes.'),
        tc('Medium', 'Inquiry Desk – Channel Lead assigns', user + ' Open query in own channel.',
           ['Open query; Assign to an Assignee of the same channel.'],
           'Status In Progress; assignee notified and sees the query.'),
        tc('Medium', 'Inquiry Desk – Assignee permissions', f'{name} user with Ticket Role Assignee.',
           ['Open Inquiry Desk.', 'Open an assigned query; send Public reply; Resolve with note.', 'Check for Assign button on an unassigned query.'],
           'Only assigned queries listed; reply and resolve work; Assign is not available.'),
        tc('Medium', 'L1 user – no Supplier Management', f'{name} Invoice Team L1 user (default permissions).',
           ['Check menu; open /app/settings/suppliers by URL.'],
           'Settings / Supplier Management not in menu; URL redirects to dashboard.'),
        tc('Medium', 'Help icon opens channel manual', user,
           ['Click Help (?) icon.'],
           f'{pdf} opens.'),
        tc('Medium', 'Profile, Notifications and Logout', user,
           ['Open Profile; Notifications › Mark all read; Logout.'],
           f'Profile shows portal access {name}; notifications clear; logout returns to sign-in.'),
        tc('Medium', 'Forgot password from channel user', APP + f' Active {name} user.',
           ['Forgot password? › Send reset email; reset; sign in to ' + name + '.'],
           'Reset works and sign-in to own portal succeeds.'),
        *extra_medium,
        tc('Normal', 'Top bar – FY and Vendor Code filters', user,
           ['Change FY; choose a vendor code.'],
           'Dashboard, register and history follow the filters.'),
        tc('Normal', 'Register – empty result', user,
           ['Combine filters that match nothing.'],
           'Readable empty state, no errors.'),
        tc('Normal', 'Phone-width layout', user + ' Browser width about 375 px.',
           ['Open dashboard and register.'],
           'No horizontal page scroll; table scrolls inside its container.'),
        tc('Normal', 'Regression – avatars and KPI wording', user,
           ['Check Owner avatars in Inquiry Desk and KPI share text.'],
           'Team avatars show clean initials (MS / PP); no "<" / ">" in share text.'),
    ]
    return rows


CHANNEL_SEARCH = {'poPortal': 'Search PO Portal invoices', 'msetuSrm': 'Search SRM invoices'}

PO = channel_cases(
    'poPortal', 'PO Portal', 'Msetu / SRM',
    'Stage (recorded approval stage), PO Type, Approver (HOD1 / HOD2 / Accounts user)',
    'Source / Recorded Approval Stage, HOD1 and HOD1 Status, HOD2 and HOD2 Status, Accounts User and Accounts Status',
    'invoice dated, uploaded, approved, sent to accounts, service entry created, MIRO created, MIRO posted, payment cleared',
    'po-portal.pdf', PO_USER,
    extra_high=[
        tc('High', 'Invoice details – PO Portal Details section', PO_USER,
           ['Open a PO Portal invoice that has HOD approvals.'],
           'PO Portal Details shows HOD1, HOD2 and Accounts approvals and SAP details matching the register Approvals columns.'),
    ],
    extra_medium=[
        tc('Medium', 'Register – Standard column set', PO_USER,
           ['Columns › Standard.'],
           'Columns: Invoice, Vendor, Vendor Code, PO, Item, Service Code, Service Line, Invoice Date, Upload Date, Amount, Status, Recorded Approval Stage, Pending With, Due Date, UTR, Rejection.'),
        tc('Medium', 'Approver filter values', PO_USER,
           ['Open Approver quick filter.'],
           'Lists HOD1, HOD2 and Accounts user names present in the data; choosing one shows invoices pending with/approved by that person.'),
    ])

SRM = channel_cases(
    'msetuSrm', 'Msetu / SRM', 'PO Portal',
    'Plant, Division, Product',
    'Approver 1 to 7, Approved By, Approval Date, Sent to Accounts Date, Approver Remarks, Status Flag, Approval Status',
    'invoice dated, uploaded, approved, sent to accounts, MIRO document dated, posted in SAP, payment cleared',
    'msetu-srm.pdf', SRM_USER,
    extra_high=[
        tc('High', 'Invoice details – SRM approvals and MIRO dates', SRM_USER,
           ['Open an SRM invoice that is Miro Booked.'],
           'Approval fields (Approver 1–7, Approval Date) and MIRO Document Date / Posting Date are shown and match the register.'),
    ],
    extra_medium=[
        tc('Medium', 'Register – Standard column set', SRM_USER,
           ['Columns › Standard.'],
           'Columns: Invoice, Vendor, Vendor Code, PAN, PO No, PO Item, Product Type, Plant Code, Division, Invoice Date, Upload Date, Payable Amount, Currency, Status, Pending With, Approval Date, Payment Due Date, UTR No, Rejection Reason.'),
        tc('Medium', 'Status "Push to PO Portal"', SRM_USER + ' Invoice with status Push to PO Portal.',
           ['Find the invoice in Search Invoice(s) and open it.'],
           'Status shows "Push to PO Portal" (passed from Msetu / SRM to PO Portal) and "Why this channel" explains the routing.'),
    ])

# ================================================================ ROLE MANAGEMENT ACROSS CHANNELS
ROLES = [
    tc('High', 'L1 user on Msetu / SRM – default access', ADMIN + ' Create user: role Invoice Team L1, Ticket Role No Ticket Access, channel Msetu / SRM; user has set password.',
       ['Sign in as the user to Msetu / SRM.', 'Check the menu.', 'Open /app/inquiry-desk and /app/settings/suppliers by URL.'],
       'Menu: Msetu / SRM Invoice Tracking, Search Invoice(s), Msetu / SRM, Profile, Logout. Export buttons visible. No Inquiry Desk or Settings; both URLs redirect to the dashboard.'),
    tc('High', 'L2 Channel Lead on PO Portal', ADMIN + ' User: Invoice Team L2, Channel Lead, PO Portal.',
       ['Sign in to PO Portal.', 'Open Inquiry Desk and Supplier Management.'],
       'Inquiry Desk lists all PO Portal queries with Assign; Supplier Management available for PO codes. Reports / Logs not shown (HQ only).'),
    tc('High', 'L3 on a channel – HQ-only capabilities not exposed', ADMIN + ' User: Invoice Team L3, Msetu / SRM.',
       ['Sign in to Msetu / SRM.', 'Open /app/supplier-visibility, /app/outputs, /app/logs, /app/settings/auditLogs by URL.', 'Open /app/vendor-code/<code> by URL.'],
       'HQ-only pages redirect away (signed in to a channel, not HQ). Vendor code page opens because L3 has Supplier Visibility permission.'),
    tc('High', 'Same user cannot hold two channels', ADMIN,
       ['Add User (non-Admin) and try to select both Msetu / SRM and PO Portal.'],
       'Channel is a single choice (radio); only one can be selected. Server rejects two with "A user can be authorized for only one channel."'),
    tc('High', 'Admin can sign in to every portal', 'Active Admin.',
       ['Sign in to All channels (HQ); log out.', 'Sign in to Msetu / SRM; log out.', 'Sign in to PO Portal.'],
       'All sign-ins succeed. In a channel portal Admin sees only that channel\'s data and the channel is locked.'),
    tc('High', 'Channel changed while user is signed in', 'SRM user signed in; Admin edits the user\'s channel to PO Portal.',
       ['As the SRM user, refresh or click any page.'],
       'Access is refused ("Workspace access is no longer authorised."); user must sign in again to PO Portal.'),
    tc('High', 'User deactivated while signed in', 'Channel user signed in; Admin sets status Inactive.',
       ['As the user, refresh.'],
       '"This account has been deactivated." The user cannot continue.'),
    tc('High', 'Grant a permission through the matrix', ADMIN + ' L1 user on PO Portal.',
       ['Roles & Permissions: tick Manage suppliers for Invoice Team L1.', 'L1 user refreshes.', 'Untick it again; L1 refreshes.'],
       'Supplier Management appears for L1 after grant and disappears after revoke; API returns 403 after revoke.'),
    tc('High', 'Revoke Export data – both channels', ADMIN + ' L2 users on PO Portal and Msetu / SRM.',
       ['Untick Export data for Invoice Team L2.', 'Both users refresh and open Search Invoice(s) and channel registers.'],
       'No Export buttons for either user in any page.'),
    tc('High', 'Revoke Search invoices', ADMIN + ' L1 user.',
       ['Untick Search invoices for L1.', 'L1 refreshes; checks menu; opens /app/search; clicks a KPI card.'],
       'Search Invoice(s) menu hidden, URL redirects to dashboard, KPI card clicks do not open search.'),
    tc('High', 'Query routing by channel', 'Supplier with codes in both channels; SRM Channel Lead, PO Channel Lead and Admin.',
       ['Supplier raises a query on a PO Portal invoice and one on an SRM invoice.', 'Check each Inquiry Desk.'],
       'PO query appears only for PO Channel Lead, SRM query only for SRM Channel Lead; Admin (HQ) sees both.'),
    tc('High', 'Assignee isolation', 'Two SRM Assignees; query assigned to Assignee A.',
       ['Assignee B opens Inquiry Desk and the query URL.'],
       'Assignee B does not see or open the query; Assignee A can reply and resolve.'),
    tc('High', 'No Ticket Access blocks Inquiry Desk', 'PO user with Ticket Role No Ticket Access.',
       ['Check menu; open /app/inquiry-desk by URL.'],
       'Inquiry Desk not shown; URL redirects; API returns "Your account has no Inquiry Desk access."'),
    tc('High', 'Supplier with codes in both channels – two-team approval', 'Request with SRM and PO codes; SRM and PO users with Manage suppliers.',
       ['SRM user approves SRM codes.', 'PO user opens the request; then uses Edit supplier to add PO codes.'],
       'SRM approval creates the account; PO user sees "Already approved by …" and can add only PO codes through Edit supplier; supplier then sees invoices of both channels.'),
    tc('Medium', 'Custom role across channels', ADMIN,
       ['Create role "Invoice Team L4" copied from L2; untick Export data.', 'Assign it to one SRM and one PO user.', 'Both sign in.'],
       'Both users get L2 access minus Export in their own channel only.'),
    tc('Medium', 'Delete role moves users', ADMIN + ' Role L4 with 2 users.',
       ['Delete L4, move users to Invoice Team L1.', 'Users refresh.'],
       'Users now have L1 permissions; Move to Admin is not offered ("Users can\'t be moved to Admin in bulk").'),
    tc('Medium', 'Rename role keeps users and permissions', ADMIN,
       ['Rename L4 to "Invoice Team Senior".'],
       'Users and permissions remain; new name shows in User Management and Welcome emails.'),
    tc('Medium', 'Promote channel user to Admin', ADMIN + ' PO L2 user.',
       ['Edit user; Application Role = Admin; save.', 'User signs in to All channels (HQ).'],
       'Ticket Role becomes Admin (inherited), channel All Channels; HQ sign-in now allowed.'),
    tc('Medium', 'Demote Admin to channel user', 'Two active Admins.',
       ['Edit Admin B to Invoice Team L2 without choosing a channel; save.', 'Choose Msetu / SRM; save.'],
       'First save blocked: "Select the channel this user can access." Second save works; B can sign in only to Msetu / SRM.'),
    tc('Medium', 'Ticket role downgrade', 'SRM Channel Lead with assigned queries.',
       ['Change Ticket Role to Assignee.', 'User refreshes Inquiry Desk.'],
       'User now sees only queries assigned to them and no Assign action.'),
    tc('Medium', 'MFOX Portal user', ADMIN + ' MFOX Portal switched on.',
       ['Create user with channel MFOX Portal.', 'User signs in to MFOX Portal, then tries Msetu / SRM.'],
       'MFOX sign-in works; Msetu / SRM refused with assigned-portal message.'),
    tc('Medium', 'Disabled channel hidden for new users', ADMIN + ' PO Portal switched off.',
       ['Open Add User.'],
       'PO Portal is not offered as Authorized Channel.'),
    tc('Medium', 'Audit trail of role changes', ADMIN,
       ['Change a permission, a user\'s role and a user\'s channel.', 'Open Audit Logs.'],
       'Each change is recorded with who did it and when.'),
    tc('Normal', 'Welcome email reflects role and channel', ADMIN,
       ['Create one SRM L1 user and one PO L2 Channel Lead.'],
       'Each Welcome email lists the correct role, portal and Inquiry Desk access.'),
    tc('Normal', 'Matrix unchanged after browser refresh', ADMIN,
       ['Tick / untick permissions; refresh the page.'],
       'Saved state is shown after refresh.'),
]

# ================================================================ workbook styling
RED = 'C8102E'
FONT = 'Arial'
HEAD = ['Test Case ID', 'Test Case Name', 'Priority', 'Preconditions', 'Test Steps', 'Expected Result', 'Actual Result', 'Status', 'Remarks']
WIDTHS = [12, 34, 10, 34, 52, 52, 30, 13, 26]
thin = Side(style='thin', color='BFBFBF')
BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)
WRAP = Alignment(wrap_text=True, vertical='top')
INPUT_FILL = PatternFill('solid', fgColor='FFF9E6')


def est_lines(text, width):
    chars = max(width * 1.15, 8)
    return sum(max(1, ceil(len(line) / chars)) for line in str(text).split('\n'))


def write_sheet(wb, title, prefix, cases, subtitle):
    ws = wb.create_sheet(title)
    cases = sorted(cases, key=lambda c: PRI_ORDER[c[0]])  # stable: keeps workflow order within priority
    for col, (h, w) in enumerate(zip(HEAD, WIDTHS), 1):
        cell = ws.cell(row=1, column=col, value=h)
        cell.font = Font(name=FONT, bold=True, color='FFFFFF', size=10)
        cell.fill = PatternFill('solid', fgColor=RED)
        cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
        cell.border = BORDER
        ws.column_dimensions[get_column_letter(col)].width = w
    ws.row_dimensions[1].height = 30
    for i, (pri, name, pre, steps, exp) in enumerate(cases, 1):
        r = i + 1
        values = [f'{prefix}-{i:03d}', name, pri, pre, '\n'.join(f'{n}. {s}' for n, s in enumerate(steps, 1)), exp, None, None, None]
        for col, v in enumerate(values, 1):
            cell = ws.cell(row=r, column=col, value=v)
            cell.font = Font(name=FONT, size=9, bold=(col == 1))
            cell.alignment = WRAP if col not in (1, 3, 8) else Alignment(horizontal='center', vertical='top', wrap_text=True)
            cell.border = BORDER
            if col in (7, 8, 9):
                cell.fill = INPUT_FILL
        lines = max(est_lines(values[c], WIDTHS[c]) for c in (1, 3, 4, 5))
        ws.row_dimensions[r].height = min(409, max(30, lines * 12.5 + 6))
    last = len(cases) + 1
    ws.freeze_panes = 'C2'
    ws.auto_filter.ref = f'A1:I{last}'

    dv_p = DataValidation(type='list', formula1='"High,Medium,Normal"', allow_blank=False, showErrorMessage=True,
                          errorTitle='Priority', error='Choose High, Medium or Normal.')
    dv_s = DataValidation(type='list', formula1='"Pass,Fail,Not Tested"', allow_blank=True, showErrorMessage=True,
                          errorTitle='Status', error='Choose Pass, Fail or Not Tested.')
    ws.add_data_validation(dv_p)
    ws.add_data_validation(dv_s)
    dv_p.add(f'C2:C{last + 200}')
    dv_s.add(f'H2:H{last + 200}')

    for val, color, font in (('High', 'F8D7DA', '9C0006'), ('Medium', 'FFEFC2', '7F5F00'), ('Normal', 'E2EFDA', '375623')):
        ws.conditional_formatting.add(f'C2:C{last + 200}', CellIsRule(operator='equal', formula=[f'"{val}"'],
                                      fill=PatternFill('solid', fgColor=color), font=Font(name=FONT, color=font, bold=True)))
    for val, color, font in (('Pass', 'C6EFCE', '006100'), ('Fail', 'FFC7CE', '9C0006'), ('Not Tested', 'E7E6E6', '3A3A3A')):
        ws.conditional_formatting.add(f'H2:H{last + 200}', CellIsRule(operator='equal', formula=[f'"{val}"'],
                                      fill=PatternFill('solid', fgColor=color), font=Font(name=FONT, color=font, bold=True)))

    ws.page_setup.orientation = 'landscape'
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.print_title_rows = '1:1'
    ws.oddFooter.center.text = f'{title} – Page &P of &N'
    return ws, last, len(cases), subtitle


def build(out):
    wb = Workbook()
    cover = wb.active
    cover.title = 'Summary'
    sheets = [
        ('Supplier A–Z', 'SUP', SUPPLIER, 'Vendor View: account request, setup, sign-in, dashboard, invoices, queries, profile'),
        ('ALL Channel A–Z', 'HQ', HQ, 'All channels (HQ) / Admin: dashboard, search, export, suppliers, users, roles, settings, Inquiry Desk'),
        ('PO Portal', 'PO', PO, 'PO Portal channel workspace'),
        ('Msetu-SRM', 'SRM', SRM, 'Msetu / SRM channel workspace'),
        ('Role Mgmt Multi-Channel', 'ROLE', ROLES, 'User roles, ticket roles and permissions across channels'),
    ]
    made = [write_sheet(wb, *s) for s in sheets]

    # ---- Summary sheet
    c = cover
    c.sheet_view.showGridLines = False
    c['B2'] = 'Mahindra I2P (Invoice Tracker) – Manual Test Cases'
    c['B2'].font = Font(name=FONT, size=16, bold=True, color=RED)
    c['B3'] = 'Version 1.0 · 1 Nov 2026 · Cases derived from the application code (routes, permission checks, validation messages).'
    c['B3'].font = Font(name=FONT, size=9, italic=True, color='5F6368')

    hdr = ['Sheet', 'Scope', 'Total', 'High', 'Medium', 'Normal', 'Pass', 'Fail', 'Not Tested', 'Not yet run', 'Pass %']
    widths = [3, 26, 58, 8, 8, 9, 9, 8, 8, 11, 12, 9]
    for i, w in enumerate(widths, 1):
        c.column_dimensions[get_column_letter(i)].width = w
    for col, h in enumerate(hdr, 2):
        cell = c.cell(row=5, column=col, value=h)
        cell.font = Font(name=FONT, bold=True, color='FFFFFF', size=10)
        cell.fill = PatternFill('solid', fgColor=RED)
        cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
        cell.border = BORDER
    row = 6
    for ws, last, count, scope in made:
        ref = f"'{ws.title}'"
        rng = lambda col: f'{ref}!${col}$2:${col}${last}'
        vals = [ws.title, scope,
                f'=COUNTA({rng("A")})',
                f'=COUNTIF({rng("C")},"High")', f'=COUNTIF({rng("C")},"Medium")', f'=COUNTIF({rng("C")},"Normal")',
                f'=COUNTIF({rng("H")},"Pass")', f'=COUNTIF({rng("H")},"Fail")', f'=COUNTIF({rng("H")},"Not Tested")',
                f'=D{row}-H{row}-I{row}-J{row}',
                f'=IF(H{row}+I{row}=0,"-",H{row}/(H{row}+I{row}))']
        for col, v in enumerate(vals, 2):
            cell = c.cell(row=row, column=col, value=v)
            cell.font = Font(name=FONT, size=10, bold=(col == 2))
            cell.border = BORDER
            cell.alignment = Alignment(horizontal='left' if col <= 3 else 'center', vertical='center', wrap_text=True)
        c.cell(row=row, column=2).hyperlink = f"#{ref}!A1"
        c.cell(row=row, column=2).font = Font(name=FONT, size=10, bold=True, color='1F4E79', underline='single')
        c.cell(row=row, column=12).number_format = '0%'
        c.row_dimensions[row].height = 30
        row += 1
    total_row = row
    c.cell(row=total_row, column=2, value='Total')
    for col in range(4, 12):
        L = get_column_letter(col)
        c.cell(row=total_row, column=col, value=f'=SUM({L}6:{L}{total_row - 1})')
    c.cell(row=total_row, column=12, value=f'=IF(H{total_row}+I{total_row}=0,"-",H{total_row}/(H{total_row}+I{total_row}))').number_format = '0%'
    for col in range(2, 13):
        cell = c.cell(row=total_row, column=col)
        cell.font = Font(name=FONT, size=10, bold=True)
        cell.fill = PatternFill('solid', fgColor='F2F2F2')
        cell.border = BORDER
        cell.alignment = Alignment(horizontal='left' if col <= 3 else 'center', vertical='center')

    r = total_row + 2
    c.cell(row=r, column=2, value='How to use').font = Font(name=FONT, size=12, bold=True, color=RED)
    guide = [
        'Cases are ordered by priority (High → Medium → Normal), and by business workflow within each priority. Run all High cases first.',
        'Fill in only the shaded columns: Actual Result, Status and Remarks. Status has a dropdown: Pass / Fail / Not Tested.',
        'Use the filter arrows in row 1 of each sheet to filter by Priority or Status. Totals above update automatically.',
        'Mark "Not Tested" when a case was deliberately skipped (blocked or not applicable) and give the reason in Remarks; leave blank if not run yet.',
        'For a Fail, write what actually happened in Actual Result and add a defect ID / screenshot name in Remarks.',
        'Test accounts needed: 1–2 Admins; internal users for Msetu / SRM and PO Portal (L1, L2, L3; Channel Lead and Assignee); 2 suppliers (one with codes in both channels).',
        'Emails (welcome, setup, reset, request decisions) need SMTP configured in the test environment.',
        'Pass % = Pass ÷ (Pass + Fail). "Not yet run" counts rows whose Status is still blank.',
        'Example of a filled row: Actual Result "Dashboard opened, company name shown" · Status "Pass" · Remarks "Chrome 130, build 1.0".',
    ]
    for i, g in enumerate(guide, 1):
        cell = c.cell(row=r + i, column=2, value=f'{i}. {g}')
        cell.font = Font(name=FONT, size=10)
        cell.alignment = Alignment(wrap_text=True, vertical='top')
        c.merge_cells(start_row=r + i, start_column=2, end_row=r + i, end_column=12)
        c.row_dimensions[r + i].height = 28
    r += len(guide) + 2
    c.cell(row=r, column=2, value='Priority meaning').font = Font(name=FONT, size=12, bold=True, color=RED)
    for i, (p, d, color) in enumerate([
        ('High', 'Critical business flow, security or data isolation. A failure blocks release.', 'F8D7DA'),
        ('Medium', 'Main features, filters, exports and validations used every day.', 'FFEFC2'),
        ('Normal', 'Edge cases, layout, regressions and convenience features.', 'E2EFDA'),
    ], 1):
        a = c.cell(row=r + i, column=2, value=p)
        a.font = Font(name=FONT, size=10, bold=True)
        a.fill = PatternFill('solid', fgColor=color)
        a.border = BORDER
        b = c.cell(row=r + i, column=3, value=d)
        b.font = Font(name=FONT, size=10)
        b.border = BORDER
    c.page_setup.orientation = 'landscape'
    c.page_setup.fitToWidth = 1
    c.page_setup.fitToHeight = 0
    c.sheet_properties.pageSetUpPr.fitToPage = True
    wb.save(out)
    print('saved', out, [m[2] for m in made])


if __name__ == '__main__':
    build(sys.argv[1])
