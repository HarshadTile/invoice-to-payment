/* Builds the four Invoice Tracker user manuals (.docx) in this folder.
 *
 *   npm install docx          (once, anywhere on NODE_PATH)
 *   node build_manuals.cjs
 *
 * Screenshots are read from ./screenshots. Every label in this file was taken from the app's
 * code; when the UI changes, update the text here and re-run. */
const fs = require('fs');
const path = require('path');
const {
  AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, ImageRun, LevelFormat,
  Packer, PageBreak, PageNumber, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun,
  WidthType, TableOfContents,
} = require('docx');

const HERE = __dirname;
const SHOTS = path.join(HERE, 'screenshots');
const RED = 'C8102E';
const GREY = '5F6368';
const PAGE_W = 9026; // A4 width minus 1" margins, in DXA
const VERSION = 'Version 1.0 · November 2026';

/* ---------- small building blocks ---------- */
let listInstance = 0;
const run = (text, opts = {}) => new TextRun({ text, ...opts });

/** Text with **bold** segments. */
function rich(text, base = {}) {
  return text.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((part) =>
    part.startsWith('**') ? run(part.slice(2, -2), { ...base, bold: true }) : run(part, base));
}
const h1 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [run(text)] });
const h2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [run(text)] });
const p = (text) => new Paragraph({ spacing: { after: 120 }, children: rich(text) });

function steps(items) {
  const instance = ++listInstance;
  return items.map((t) => new Paragraph({ numbering: { reference: 'steps', level: 0, instance }, spacing: { after: 60 }, children: rich(t) }));
}
const bullets = (items) => items.map((t) => new Paragraph({ numbering: { reference: 'bullets', level: 0 }, spacing: { after: 60 }, children: rich(t) }));

function note(text, label = 'Note') {
  return new Paragraph({
    spacing: { before: 120, after: 160 },
    shading: { type: ShadingType.CLEAR, fill: 'FDF1F3' },
    border: { left: { style: BorderStyle.SINGLE, size: 18, color: RED, space: 8 } },
    indent: { left: 120 },
    children: [run(`${label}: `, { bold: true, color: RED }), ...rich(text)],
  });
}

function table(head, rows, widths) {
  const total = widths.reduce((a, b) => a + b, 0);
  const cols = widths.map((w) => Math.round((w / total) * PAGE_W));
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'D9D9D9' };
  const cell = (text, i, isHead) => new TableCell({
    width: { size: cols[i], type: WidthType.DXA },
    shading: isHead ? { type: ShadingType.CLEAR, fill: 'F3F3F3' } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    borders: { top: border, bottom: border, left: border, right: border },
    children: [new Paragraph({ children: rich(text, isHead ? { bold: true, size: 19 } : { size: 19 }) })],
  });
  return new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    columnWidths: cols,
    rows: [
      new TableRow({ tableHeader: true, children: head.map((t, i) => cell(t, i, true)) }),
      ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((t, i) => cell(t, i, false)) })),
    ],
  });
}
const spacer = () => new Paragraph({ spacing: { after: 120 }, children: [] });

let figure = 0;
function shot(name, caption) {
  const file = path.join(SHOTS, `${name}.png`);
  if (!fs.existsSync(file)) return [];
  figure += 1;
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { before: 120, after: 40 }, keepNext: true,
      children: [new ImageRun({ type: 'png', data: fs.readFileSync(file), transformation: { width: 600, height: 375 },
        altText: { title: caption, description: caption, name } })],
    }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 },
      children: [run(`Figure ${figure}: ${caption}`, { italics: true, size: 18, color: GREY })] }),
  ];
}

/* ---------- shared content ---------- */
const PORTAL = { hq: 'All channels (HQ)', po: 'PO Portal', srm: 'Msetu / SRM' };

function aboutInternal(ws) {
  const who = {
    hq: 'head-office (HQ) users and Admins who track invoices across **all channels**: Msetu / SRM and PO Portal.',
    po: 'the invoice team that works on **PO Portal** invoices. After sign-in, everything you see is limited to the PO Portal channel.',
    srm: 'the invoice team that works on **Msetu / SRM** invoices. After sign-in, everything you see is limited to the Msetu / SRM channel.',
  }[ws];
  return [
    h1('1. About this guide'),
    p(`Invoice Tracker shows where every supplier invoice is, from upload to payment. This guide is for ${who}`),
    note('What you see in the menu depends on your role (Invoice Team L1, L2, L3 or Admin). If a menu item in this guide is missing for you, your role does not include it. Ask an Admin if you need it.'),
  ];
}

function signIn(ws) {
  return [
    h1('2. Signing in'),
    h2('2.1 First-time setup'),
    p('An Admin creates your account. You then receive a **Welcome** email that lists your role, your portal and your Inquiry Desk access.'),
    ...steps([
      'Open the email and click **Set Your Password**. The link works for a limited time only.',
      'Choose a password of at least 8 characters, confirm it and save.',
      'Sign in as described below.',
    ]),
    h2('2.2 Sign in'),
    ...steps([
      'Open the Invoice Tracker sign-in page.',
      'Click **Internal Team**.',
      `In **Portal / Team**, select **${PORTAL[ws]}**.`,
      'Enter your **Email ID** and **Password**.',
      'Keep **Remember me on this device** ticked only on your own computer.',
      'Click **Continue**. Your dashboard opens.',
    ]),
    ...shot('login_internal', 'Sign-in page: Internal Team'),
    ws === 'hq'
      ? note('Admins can sign in to any portal. Other users can only open the portal assigned to them.')
      : note(`Your account is set up for ${PORTAL[ws]}. If you choose a different portal you will see "This account can only sign in to its assigned portal."`),
    h2('2.3 Forgot password'),
    ...steps([
      'On the sign-in page click **Forgot password?**',
      'Enter your **Sign-in email** and click **Send reset email**.',
      'Open the email and click the link.',
      'Enter a new password (at least 8 characters) twice and save. Then sign in again.',
    ]),
  ];
}

function layout(ws) {
  return [
    h1('3. Finding your way around'),
    table(['Area', 'What it does'], [
      ['Left menu', ws === 'hq'
        ? 'Invoice Tracking, Search Invoice(s), Processing Channels (Msetu / SRM, PO Portal), Supplier Visibility, Inquiry Desk, Notifications, then Reports & admin: Vendor Status Reports, Logs / History, Settings, Profile, Logout.'
        : `${PORTAL[ws]} Invoice Tracking, Search Invoice(s), ${PORTAL[ws]} (the channel page), Inquiry Desk, Notifications, Settings (Supplier Management), Profile, Logout.`],
      ['FY filter (top bar)', 'Choose the financial year, or **All Years**. All pages use this choice.'],
      ['Channel (top bar)', ws === 'hq' ? 'Choose **All Channels** or one channel.' : `Fixed to ${PORTAL[ws]}. The tooltip says "Your scope is locked to this channel".`],
      ['Vendor Code (top bar)', 'Show only one supplier\'s invoices. Type to search the list.'],
      ['Bell icon', 'Your latest notifications. The red number shows unread ones.'],
      ['☰ (menu) icon', 'Collapse or expand the left menu.'],
      ['Back link (under the top bar)', 'Returns to the page you came from.'],
    ], [1, 3]),
    spacer(),
  ];
}

function dashboard(ws) {
  const title = ws === 'hq' ? 'Invoice Tracking' : `${PORTAL[ws]} Invoice Tracking`;
  return [
    h1(`4. Dashboard (${title})`),
    p('The dashboard is the first page after sign-in. It gives a quick picture of all invoices for the selected year, channel and vendor code.'),
    ...shot(`${ws}_dashboard`, `${title} dashboard`),
    h2('4.1 Summary cards'),
    table(['Card', 'Meaning'], [
      ['Total Invoices', 'All invoices in your selection, with total value and the number rejected or deleted.'],
      ['Pending Approval', 'Waiting for the approver to act.'],
      ['Approved', 'Approved by the business.'],
      ['Miro Booked', 'Booked in SAP, waiting for payment.'],
      ['Paid', 'Payment cleared.'],
    ], [1, 3]),
    p('Each card also shows its share of all invoices (for example "0.8% of invoices") and the amount, when an amount is on record.'),
    h2('4.2 Charts'),
    ...bullets([
      `**Invoices by channel**: invoice count and value per channel${ws === 'hq' ? '' : ' (only your channel)'}. Switch between **Chart** and **Table**.`,
      '**Service vs Material**: how many invoices are for services and how many for material.',
      '**Monthly invoices**: invoices per month for the last 12 months. Use the **Date** chip to change which date is counted (for example invoice date or payment due date). Click a month to open those invoices.',
      '**Invoice pipeline**: how many invoices sit at each status, in workflow order. Click a status to open those invoices.',
      '**Recent Invoices**: the latest 5 invoices.',
    ]),
    note('Clicking a card, month or status opens Search Invoice(s) with that filter. This needs the "Search invoices" permission.', 'Tip'),
  ];
}

function search(ws) {
  return [
    h1('5. Search and track an invoice'),
    ...steps([
      'Click **Search Invoice(s)** in the left menu.',
      'Type in the search box: invoice number, PO number, status, date or amount. To search several fields at once, separate them with commas in this order: **invoice, PO, item, UTR**.',
      'Narrow the list with the chips: **Status**, **Product**, **Date** (Invoice, Upload, Approval, MIRO booking, Payment Due or UTR clearing date) and a date range.',
      'Click an **invoice number** (or the eye icon) to open its details.',
      'Click **Clear** to remove all filters, or **All dates** to remove the date range.',
    ]),
    ...shot(ws === 'hq' ? 'hq_search' : `${ws}_register`, ws === 'hq' ? 'Search Invoice(s)' : `${PORTAL[ws]} invoice register`),
    h2('5.1 Invoice details'),
    p('The details window shows:'),
    ...bullets([
      '**Status and channel**, with a short "Why this channel" explanation.',
      '**Currently Handled By**: the approver and accounts person (or "Not assigned").',
      '**Invoice Progress**: Initial → Invoice Uploaded → Pending for Approval → Approved → Miro Booked → Paid. The current step says "In progress".',
      '**Status & payment**: current status and UTR number. "Not yet visible" means the payment reference has not arrived yet.',
      '**Dates**: Invoice Date, Upload Date, Payment Due Date and Payment Date.',
      ...(ws === 'po' ? ['**PO Portal Details**: HOD1, HOD2 and Accounts approvals and SAP details for PO Portal invoices.'] : []),
    ]),
    ...shot(ws === 'hq' ? 'hq_invoice_popup' : `${ws}_invoice_popup`, 'Invoice details'),
    h2('5.2 Export to Excel'),
    p('Click **Export to Excel (N)** above the table to download the invoices that match your filters. Tick rows first to export only those (**Export Selected to Excel**). The button only appears if your role has the "Export data" permission.'),
  ];
}

const CHANNEL = {
  po: {
    name: 'PO Portal',
    search: 'Search PO Portal invoices',
    quick: '**Stage** (approval stage recorded by the source), **PO Type** and **Approver** (HOD1, HOD2 or Accounts user)',
    columns: 'Invoice, Vendor, Vendor Code, PO, Item, Service Code, Service Line, Invoice Date, Upload Date, Amount, Status, Recorded Approval Stage, Pending With, Due Date, UTR, Rejection',
    approvals: 'Source / Recorded Approval Stage, HOD1 and HOD1 Status, HOD2 and HOD2 Status, Accounts User and Accounts Status',
    history: 'Invoice dated, uploaded, approved, sent to accounts, service entry created, MIRO created, MIRO posted, payment cleared',
  },
  srm: {
    name: 'Msetu / SRM',
    search: 'Search SRM invoices',
    quick: '**Plant**, **Division** and **Product**',
    columns: 'Invoice, Vendor, Vendor Code, PAN, PO No, PO Item, Product Type, Plant Code, Division, Invoice Date, Upload Date, Payable Amount, Currency, Status, Pending With, Approval Date, Payment Due Date, UTR No, Rejection Reason',
    approvals: 'Approver 1 to 7, Approved By, Approval Date, Sent to Accounts Date, Approver Remarks, Status Flag, Approval Status',
    history: 'Invoice dated, uploaded, approved, sent to accounts, MIRO document dated, posted in SAP, payment cleared',
  },
};

function channelPage(ws) {
  const c = CHANNEL[ws];
  return [
    h1(`6. ${c.name} channel page`),
    p(`Click **${c.name}** in the left menu. This page lists every ${c.name} invoice with the fields that come from ${c.name}.`),
    h2('6.1 Invoice Register'),
    ...steps([
      `Use **${c.search}** to find an invoice by any field.`,
      `Use the quick filters at the top right: ${c.quick}.`,
      'Use the **Status** and **Date** chips and the date range to narrow the list.',
      'Click **Columns** to choose a set of columns: **Standard**, **Approvals**, **All fields** or **Custom**.',
      'Click an invoice number or **View** to open its details.',
      'Click **Export to Excel (N)** to download the list (needs the "Export data" permission).',
    ]),
    table(['Column set', 'Fields shown'], [
      ['Standard', c.columns],
      ['Approvals', c.approvals],
    ], [1, 4]),
    spacer(),
    h2('6.2 History'),
    p(`Click the **History** tab to see a timeline of events for the invoices in your filter: ${c.history}. Use the search and date filters to find one invoice's history.`),
    ...shot(`${ws}_history`, `${c.name}: History tab`),
  ];
}

function inquiryDesk(n) {
  return [
    h1(`${n}. Inquiry Desk (supplier queries)`),
    p('Suppliers raise queries about their invoices. They come to the Inquiry Desk of the invoice\'s channel. You only see this menu if you have an Inquiry Desk role: Admin, Channel Lead or Assignee.'),
    ...steps([
      'Click **Inquiry Desk**. The cards show **Open**, **In Progress**, **SLA Breached** and **Resolved / Closed** queries. Click a card to filter.',
      'Search by query number, invoice, vendor, subject or owner. Filter with **All categories**. Switch between **List** and **Board** view.',
      'Click a query to open it.',
      'Write in the reply box. Choose **Public reply** (the supplier sees it) or **Internal note** (only the Mahindra team sees it). Attach a file if needed and click **Send**.',
      'Use **Assign** to give the query to a team member.',
      'When the issue is solved, click **Resolve** and add a resolution note. The supplier can then close it or reopen it.',
    ]),
    ...shot('hq_inquiry_desk', 'Inquiry Desk'),
    note('Channel Leads see and assign all queries in their channel. Assignees see and answer the queries assigned to them.'),
  ];
}

function supplierManagement(n, ws) {
  const team = ws === 'hq' ? 'Admins can change any code.' : `You can tick only ${PORTAL[ws]} codes. Codes of the other channel show "Managed by the … team" and cannot be changed by you.`;
  return [
    h1(`${n}. Supplier Management`),
    p('Settings › **Supplier Management** lets you give suppliers access to the portal. You need the "Manage suppliers" permission.'),
    ...shot('hq_suppliers', 'Supplier Management'),
    h2(`${n}.1 Review an access request`),
    p('A supplier can ask for an account from the sign-in page, or ask to add or remove vendor codes from their profile. You get a notification.'),
    ...steps([
      'Open the **Access requests** tab. Requests waiting for you show **Pending**.',
      'Click **Review**. Check **Match with invoice data**: each vendor code shows **Found** or **Not found**, with the supplier name and PAN in our data.',
      'Tick the vendor codes to give.',
      'Click **Approve & send setup email** (new account) or **Apply change** (code change). The supplier receives an email.',
      'To refuse, click **Reject…**, pick a reason (for example "Details don\'t match our records"), add a note and click **Reject and email supplier**.',
    ]),
    note(`${team} If another team has already approved the request, you see "Already approved by … Use Edit supplier to add your codes."`),
    h2(`${n}.2 Add or manage a supplier`),
    ...bullets([
      '**Add Supplier**: search the supplier name, PAN or vendor code, enter their email, tick the vendor codes and click **Create supplier**. A setup email is sent.',
      'Row icons: **Edit supplier details**, **Send setup email**, **Send password reset email**, **Delete supplier**.',
      '**Activate** / **Deactivate** turns a supplier\'s sign-in on or off.',
    ]),
  ];
}

function personal(n) {
  return [
    h1(`${n}. Notifications, Profile and Logout`),
    ...bullets([
      '**Notifications**: updates on queries and supplier requests. Click **Mark all read** to clear the count. Use **All** / **Unread** and the search box.',
      '**Profile**: your name, email, role and portal access.',
      '**Logout**: click **Logout** and confirm **Log Out**. Always log out on a shared computer.',
    ]),
  ];
}

function statusTable(n) {
  return [
    h1(`${n}. Invoice status meanings`),
    table(['Status', 'What it means'], [
      ['Initial', 'Invoice recorded; not yet uploaded.'],
      ['Push to PO Portal', 'Passed from Msetu / SRM to PO Portal for processing.'],
      ['Invoice Uploaded', 'Invoice uploaded by the supplier.'],
      ['Pending for Approval', 'Waiting for the approver.'],
      ['Action Required', 'The approver has asked for more information.'],
      ['Level Approved', 'Approved at one level; more approvals pending.'],
      ['Approved', 'Approved by the business.'],
      ['Miro Booked', 'Booked in SAP (MIRO); waiting for payment.'],
      ['Paid', 'Payment cleared; UTR number available.'],
      ['Rejected', 'Rejected; the rejection reason is shown with the invoice.'],
      ['Entry Deleted / Deleted', 'Removed from processing.'],
    ], [1, 3]),
    spacer(),
  ];
}

function messagesTable(n, extra = []) {
  return [
    h1(`${n}. Common messages and what to do`),
    table(['Message', 'What to do'], [
      ['Invalid email or password.', 'Check your email and password. Use Forgot password? if needed.'],
      ['This account hasn\'t been activated yet…', 'Use the Set Your Password link from your Welcome email, or ask an Admin for a new one.'],
      ['This account has been deactivated. Contact an administrator.', 'Ask an Admin to activate your account.'],
      ['This account can only sign in to its assigned portal.', 'Choose your own portal in Portal / Team.'],
      ['This portal is currently disabled. Contact your administrator.', 'The portal has been switched off by an Admin.'],
      ['This reset link is invalid or has expired. Request a new one.', 'Use Forgot password? again and use the newest email.'],
      ['Unable to load portal options. Refresh the page to try again.', 'Refresh the page. If it continues, contact support.'],
      ['No invoices match', 'Clear a filter or widen the date range. Check the FY and Vendor Code filters in the top bar.'],
      ['UTR "Not yet visible"', 'The payment reference has not arrived yet. Check again later.'],
      ...extra,
    ], [1, 1]),
    spacer(),
    p('**Need help?** Use **Contact Us** at the top of the sign-in page to email the helpdesk.'),
  ];
}

function rolesTable(n) {
  return [
    h1(`${n}. Roles and what they can do (default)`),
    table(['Role', 'Default access'], [
      ['Invoice Team L1', 'Dashboard, Search invoices, Export data.'],
      ['Invoice Team L2', 'L1 + Manage suppliers, Vendor Status Reports, Logs / History.'],
      ['Invoice Team L3', 'L2 + Audit logs, Supplier Visibility.'],
      ['Admin', 'Everything, including Settings (integrations, users, roles).'],
    ], [1, 3]),
    p('Admins can change these permissions in Settings › Roles & Permissions, so your access may differ.'),
    p('Reports, Logs / History, Supplier Visibility and the other Settings pages are available only when signed in to **All channels (HQ)**.'),
  ];
}

/* ---------- HQ-only sections ---------- */
function hqExtras() {
  return [
    h1('6. Processing Channels'),
    p('Under **Processing Channels** open **Msetu / SRM** or **PO Portal** to see that channel\'s own invoice register (with channel-specific columns and filters) and its **History** tab. These pages work the same way as described in the PO Portal and Msetu / SRM manuals.'),
    h1('7. Supplier Visibility'),
    ...steps([
      'Click **Supplier Visibility**.',
      'Pick a supplier by **Supplier Name**, **PAN** or **Vendor Code**.',
      'See the supplier\'s **Total Invoices**, **Paid**, **Open Queries** and **Total Invoice Amount**, and their invoice list as the supplier sees it.',
      'Use the status and date filters. The **Filtered Invoice Amount** shows the total of the filtered list.',
    ]),
    ...shot('hq_supplier_visibility', 'Supplier Visibility'),
    h1('8. Vendor Status Reports'),
    p('Shows completed invoices (payment confirmed, UTR available). Cards: **Completed Invoices**, **Suppliers Covered**, **Paid Value**, **Top Supplier**. Search the list, tick rows if needed and click **Export to Excel**.'),
    ...shot('hq_reports', 'Vendor Status Reports'),
    h1('9. Logs / History'),
    p('A combined history of invoice, payment and query events. Search by invoice, vendor, PO or details; filter by type (Invoice, Payment, Query) and date; click **Export (N)** to download. Columns: Date, Invoice No, Vendor Code, PO No, Type, Event, Performed By, Details.'),
    ...shot('hq_logs', 'Logs / History'),
  ];
}

function settingsAdmin(n) {
  return [
    h1(`${n}. Settings (Admin)`),
    h2(`${n}.1 Integration Settings`),
    p('Shows the health of data connections. Under **Portal Availability** an Admin can switch each portal on or off (Msetu / SRM, PO Portal, MFOX Portal). A switched-off portal cannot be used for sign-in.'),
    ...shot('hq_integrations', 'Integration Settings'),
    h2(`${n}.2 User Management`),
    ...steps([
      'Click **Add User**. Enter **Full Name** and **Email**, choose the **Application Role**, the **Ticket Role** (Inquiry Desk access) and the **Authorized Channel**.',
      'Click **Create User & Generate Link**. The user receives a Welcome email with a Set Your Password link.',
      'Use the row icons to **Edit user** (including Active / Inactive status), **Send account setup or password reset email**, or **Remove User**.',
    ]),
    ...shot('hq_users', 'User Management'),
    h2(`${n}.3 Roles & Permissions`),
    p('A table of roles and permissions. Tick or untick a box to allow or remove a permission. Use **New role** to create a role and **Edit roles** to rename or delete one (users of a deleted role are moved to another role you choose).'),
    ...shot('hq_roles', 'Roles & Permissions'),
    h2(`${n}.4 Audit Logs`),
    p('A record of sign-ins, failed sign-ins and changes made in the app, with search and event-type filters.'),
  ];
}

/* ---------- supplier manual ---------- */
function supplierManual() {
  return [
    h1('1. About this guide'),
    p('The Mahindra Invoice Tracker supplier portal lets you see the status of your invoices, when you will be paid, and the payment reference (UTR). You can also raise a query about an invoice. This guide explains every step.'),
    h1('2. Getting an account'),
    h2('2.1 Request an account'),
    ...steps([
      'Open the sign-in page. Under "New supplier, or no account yet?" click **Request an account**.',
      'Enter your **Company** name and your **Email**. This email will be your sign-in. Each account needs its own email.',
      'Enter your **PAN** (10 characters, like ABCDE1234F).',
      'Enter your **Vendor codes**. Separate several codes with a comma or space.',
      'Add a **Note** only if you are unsure about something (optional).',
      'Click **Submit request**. A "Request submitted" message confirms it and you also receive an email.',
    ]),
    ...shot('request_account', 'Request an account'),
    p('The Mahindra team reviews your request. If it is approved you receive an email with a link to set your password. If it is rejected the email tells you why.'),
    h2('2.2 Set your password'),
    ...steps([
      'Open the email and click the link. The link works for a limited time.',
      'Confirm your **Email**, enter a **New password** (at least 8 characters) and **Confirm password**.',
      'Click **Set password and continue**. You are taken to the sign-in page.',
    ]),
    h1('3. Signing in'),
    ...steps([
      'Open the sign-in page. **Supplier** is selected.',
      'Enter your **Email** and **Password**.',
      'Keep **Remember me on this device** ticked only on your own computer.',
      'Click **Continue**. Your dashboard opens.',
    ]),
    ...shot('login_supplier', 'Supplier sign-in'),
    note('After 5 wrong passwords your account is locked for 15 minutes.'),
    h2('3.1 Forgot password'),
    ...steps([
      'Click **Forgot password?** on the sign-in page.',
      'Enter your **Sign-in email** and click **Send reset email**.',
      'Open the email, click the link and choose a new password.',
    ]),
    h1('4. Finding your way around'),
    table(['Area', 'What it does'], [
      ['Left menu', 'Dashboard, My Invoices, Logs, My Queries, Notifications, My Profile, Logout.'],
      ['FY filter (top bar)', 'Choose the financial year.'],
      ['Vendor code list (top bar)', 'Show one vendor code, or **All vendor codes**.'],
      ['Bell icon', 'Your latest notifications.'],
    ], [1, 3]),
    spacer(),
    h1('5. Dashboard'),
    ...shot('sup_dashboard', 'Supplier dashboard'),
    table(['Card', 'Meaning'], [
      ['Total Invoices', 'All your invoices in this selection.'],
      ['In Progress', 'Not yet paid or rejected.'],
      ['Awaiting Payment', 'Approved or booked in SAP; payment pending.'],
      ['Fully Paid', 'Payment cleared.'],
      ['Rejected', 'Needs a corrected invoice.'],
    ], [1, 3]),
    spacer(),
    ...bullets([
      '**Amount received**, **Outstanding**, **Overdue** and **Avg. days to payment** show your money position.',
      '**Monthly invoices** and **Where my invoices are** charts: click a month or status to see those invoices.',
      '**Upcoming payments** (next 30 days), **Needs attention** (rejected invoices, with **Raise a query**), **Recent payments** (with UTR) and **My Queries**.',
      'Click any card to open My Invoices filtered to that group.',
    ]),
    h1('6. My Invoices'),
    ...steps([
      'Click **My Invoices**.',
      'Use the **Status** filter, the **Date** chip and the date range, or type in the search box.',
      'Click an **invoice number** to see its progress.',
      'Click **Export to Excel (N)** to download the list.',
    ]),
    ...shot('sup_invoices', 'My Invoices'),
    h2('6.1 Invoice details'),
    p('The invoice page shows the **Invoice Progress** (Initial → Invoice Uploaded → Pending for Approval → Approved → Miro Booked → Paid), the payment due date, payment date and **UTR No.** If the invoice was rejected, the **rejection reason** is shown. Click **View Full Detail** for all fields.'),
    ...shot('sup_invoice_detail', 'Invoice details'),
    h1('7. Raising a query'),
    ...steps([
      'Open the invoice and click **Raise a Query** (or the flag icon in the invoice list).',
      'Choose the **Topic** (for example Payment Not Received, Amount Mismatch, Invoice Rejected) and the **Priority** (Low, Medium, High).',
      'Write a **Subject** and **Details**. Attach a file if needed (5 MB maximum).',
      'Click **Submit Query**. The query goes to the Mahindra team of that invoice\'s channel.',
    ]),
    ...shot('sup_raise_query', 'Raise a query'),
    h2('7.1 Following up'),
    ...bullets([
      '**My Queries** shows **Open** (waiting for the Mahindra team), **In Progress** and **Resolved / Closed** queries.',
      'Open a query to read the replies. Write in **Write a reply** and click **Send** while it is open or in progress.',
      'When the team resolves it, click **Close** if you are satisfied, or **Reopen** and give a reason.',
    ]),
    ...shot('sup_queries', 'My Queries'),
    h1('8. Logs, Notifications and Profile'),
    ...bullets([
      '**Logs**: a timeline of invoice events, payments and query updates. Filter by type and search; export to CSV.',
      '**Notifications**: updates on your queries. Click **Mark all read** to clear them.',
      '**My Profile**: your sign-in email, PAN and vendor codes.',
    ]),
    h2('8.1 Add or remove vendor codes'),
    ...steps([
      'Go to **My Profile** › **Vendor code access** and click **Request a change**.',
      'Enter **Vendor codes to add** and/or tick **Vendor codes to remove**.',
      'Write a **Note** explaining why (required) and click **Send request**.',
      'The status shows **Waiting for review**, then **Approved** or **Rejected**. You can send a new request once the current one is reviewed.',
    ]),
    ...shot('sup_profile', 'My Profile'),
    h1('9. Invoice status meanings'),
    table(['Status', 'What it means'], [
      ['Initial', 'Invoice recorded; not yet uploaded.'],
      ['Invoice Uploaded', 'Your invoice has been received.'],
      ['Pending for Approval', 'Waiting for Mahindra approval.'],
      ['Action Required', 'Mahindra needs more information; raise a query if you are unsure what is needed.'],
      ['Approved', 'Approved; moving to accounts.'],
      ['Miro Booked', 'Booked in SAP; payment will follow.'],
      ['Paid', 'Payment made; see the UTR number.'],
      ['Rejected', 'Rejected; see the reason and send a corrected invoice.'],
    ], [1, 3]),
    spacer(),
    h1('10. Common messages and what to do'),
    table(['Message', 'What to do'], [
      ['Email or password is incorrect, or the account is inactive.', 'Check your email and password. Use Forgot password? If it still fails, your account may be inactive; contact the Mahindra team.'],
      ['This link is invalid or has expired. Ask the team for a new one.', 'The setup or reset link is used or too old. Use Forgot password?, or ask the team for a new setup email.'],
      ['That email doesn\'t match this link.', 'Enter the email address the link was sent to.'],
      ['This email already has a supplier account. Sign in, or use Forgot password.', 'Sign in with that email instead of requesting a new account.'],
      ['A request from this email is already waiting for review.', 'Wait for the review email.'],
      ['PAN must be 10 characters like ABCDE1234F.', 'Check your PAN.'],
      ['Too many requests. Please try again a little later.', 'Wait a while before trying again.'],
      ['This portal is currently disabled. Contact your administrator.', 'Contact the Mahindra team.'],
      ['Attachment must be 5 MB or smaller.', 'Attach a smaller file.'],
      ['UTR "Not yet visible"', 'Payment reference not available yet. Check again later.'],
    ], [1, 1]),
    spacer(),
    p('**Need help?** Use **Contact Us** at the top of the sign-in page to email the helpdesk.'),
  ];
}

/* ---------- manuals ---------- */
function internalManual(ws) {
  const parts = [...aboutInternal(ws), ...signIn(ws), ...layout(ws), ...dashboard(ws), ...search(ws)];
  let n;
  if (ws === 'hq') {
    parts.push(...hqExtras());
    n = 10;
    parts.push(...inquiryDesk(n++), ...supplierManagement(n++, ws), ...settingsAdmin(n++));
  } else {
    parts.push(...channelPage(ws));
    n = 7;
    parts.push(...inquiryDesk(n++), ...supplierManagement(n++, ws));
  }
  parts.push(...personal(n++), ...statusTable(n++), ...rolesTable(n++), ...messagesTable(n++));
  return parts;
}

const MANUALS = [
  { file: '1_All_Channels_HQ_User_Manual.docx', title: 'All Channels (HQ)', audience: 'HQ users and Admins', body: () => internalManual('hq') },
  { file: '2_PO_Portal_User_Manual.docx', title: 'PO Portal', audience: 'PO Portal invoice team', body: () => internalManual('po') },
  { file: '3_Msetu_SRM_User_Manual.docx', title: 'Msetu / SRM', audience: 'Msetu / SRM invoice team', body: () => internalManual('srm') },
  { file: '4_Vendor_View_User_Manual.docx', title: 'Vendor View (Supplier Portal)', audience: 'Suppliers / vendors', body: supplierManual },
];

function cover(m) {
  return [
    new Paragraph({ spacing: { before: 2400 }, children: [run('Invoice Tracker', { size: 28, color: RED, bold: true })] }),
    new Paragraph({ spacing: { before: 120 }, children: [run('User Manual', { size: 56, bold: true })] }),
    new Paragraph({ spacing: { before: 120, after: 240 }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: RED, space: 6 } },
      children: [run(m.title, { size: 40, color: '252525' })] }),
    new Paragraph({ children: [run(`For: ${m.audience}`, { size: 22, color: GREY })] }),
    new Paragraph({ children: [run(VERSION, { size: 22, color: GREY })] }),
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({ spacing: { after: 200 }, children: [run('Contents', { bold: true, size: 32 })] }),
    new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-2' }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

async function build(m) {
  figure = 0;
  const doc = new Document({
    title: `Invoice Tracker User Manual: ${m.title}`,
    creator: 'Invoice Tracker team',
    features: { updateFields: true },
    styles: {
      default: { document: { run: { font: 'Calibri', size: 21 } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 30, bold: true, color: RED }, paragraph: { spacing: { before: 360, after: 140 }, keepNext: true, outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 24, bold: true, color: '252525' }, paragraph: { spacing: { before: 240, after: 100 }, keepNext: true, outlineLevel: 1 } },
      ],
    },
    numbering: {
      config: [
        { reference: 'steps', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 400, hanging: 300 } } } }] },
        { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 400, hanging: 260 } } } }] },
      ],
    },
    sections: [{
      properties: { page: { margin: { top: 1440, bottom: 1300, left: 1440, right: 1440 } } },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT,
        children: [run(`Invoice Tracker · ${m.title}`, { size: 16, color: GREY })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
        children: [run('Page ', { size: 16, color: GREY }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GREY })] })] }) },
      children: [...cover(m), ...m.body()],
    }],
  });
  fs.writeFileSync(path.join(HERE, m.file), await Packer.toBuffer(doc));
  console.log('wrote', m.file);
}

(async () => { for (const m of MANUALS) await build(m); })();
