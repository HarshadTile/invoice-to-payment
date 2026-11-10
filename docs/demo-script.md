# Mahindra Invoice-to-Payment (I2P) Tracker: Business Demo Script

Duration: about 25 minutes. Audience: business and finance leadership, and supplier-facing teams.
Lines in quotes are ready to speak. Lines starting with **Click** are your actions.

---

## Before you start (presenter checklist)

- Backend and frontend are running and the invoice data has finished loading. With the BigQuery source the first load takes 1-2 minutes.
- Two logins ready: one **Supplier** and one **Invoice Team** (L2 or higher, so Search and Reports are visible).
- Sample data on hand: an invoice with a UTR (paid), one rejected invoice, one open query.
- Keep `.env` and tokens off the screen.

---

## 1. Opening (2 min)

"Good morning, everyone. Let me start with a question every supplier asks us: *Where is my invoice, and when will I be paid?*

Today, answering that means phone calls and emails. Our Invoice Team then checks SRM, the PO portal and SAP one by one. It is slow for the supplier and it takes our team's time.

The Invoice-to-Payment Tracker puts the whole journey in one place. Suppliers see their own invoices, from upload to approval, SAP booking and payment. Our Invoice Team sees everything and answers queries from one desk.

I'll show you both sides. It should take about twenty minutes."

---

## 2. Demo flow

### Screen 1: Login page (2 min)

**Click:** Open the login page. Point to the role options, then the scope selector for internal users, then the "Need help?" footer.

"There are two kinds of users. Suppliers sign in with their email and password. Internal users sign in and choose their scope: all channels, Msetu/SRM only, or PO Portal only. So each team works on its own channel.

New suppliers don't need IT. Our team sends a one-time setup link, or the supplier asks for access here with their company, PAN and vendor codes. A manager approves it and the supplier gets an email.

If anyone gets stuck, the helpdesk email and phone number are always at the bottom."

### Screen 2: Supplier Dashboard (3 min)

**Click:** Sign in as the supplier. You land on **Dashboard**.

"This is what a supplier sees every morning. At the top are tiles: total invoices, in progress, awaiting payment, fully paid, rejected and overdue. There is also a tile for payments due in the next few days.

Below that, they see how much has been paid, how much is waiting, and how much is overdue. The chart 'Where my invoices are' shows at which step their invoices are sitting right now.

Two lists matter most. **Upcoming payments** tells them what money is coming. **Needs attention** lists rejected invoices with the reason, so they can fix and resubmit without calling us.

One important point: a supplier only sees the vendor codes assigned to them. That is enforced on the server, not just hidden on screen."

### Screen 3: My Invoices and invoice detail (3 min)

**Click:** **My Invoices**. Click the "Awaiting Payment" tile. Search by an invoice number. Open an invoice.

"Each tile is clickable. I click 'Awaiting Payment' and the register filters to exactly those invoices.

I can search by invoice number, PO number or UTR, and filter by status and date. I can also export the list.

Now I open one invoice. At the top is a progress bar showing the journey: uploaded, approved, booked in SAP, then paid. Below it are the payment due date, the payment date, and the bank reference number, the UTR.

The supplier gets a complete, current answer in about ten seconds, with no phone call."

### Screen 4: Raise a query (2 min)

**Click:** In the invoice popup, click the query button. Pick a category (for example *Payment Date Enquiry*), set a priority, add a note, submit. Then open **My Queries**.

"If the answer is still not clear, the supplier raises a query right from the invoice. The invoice details are attached automatically.

They choose a category such as payment not received, amount mismatch or PO/GRN issue, add a priority and a note, and attach a file if needed.

In **My Queries** they can follow the conversation, add comments and see the status: open, in progress, resolved or closed. They get a notification when we reply."

### Screen 5: Invoice Team dashboard (3 min)

**Click:** Sign out and sign in as the Invoice Team user. Open **Invoice Tracking**. Use the top bar to change year, channel or vendor.

"Now the other side. This is the Invoice Team's view across all suppliers.

The tiles show the pipeline: total invoices with their value, pending approval, approved, booked in SAP, and paid. The charts show volume by channel, service versus material, month by month trend, and where invoices are stuck.

This is where a manager sees a bottleneck. If a lot of invoices are pending approval, we know where to push."

### Screen 6: Search Invoice(s) (2 min)

**Click:** **Search Invoice(s)**. Type an invoice number. Then try a comma search, for example invoice, PO. Apply a status chip. Show **Export**.

"When a supplier calls, this is the one box the team uses. Type an invoice number, a PO or a UTR and the invoice appears.

I can also type values separated by commas, for example an invoice and a PO, to narrow it down. The chips on top filter by status, product, date, vendor and channel.

Export is limited to roles that have export permission, so data doesn't leave without control."

### Screen 7: Processing Channels (2 min)

**Click:** **Processing Channels**, then **Msetu/SRM**. Show the Register and History tabs and the **Columns** menu. Then show **PO Portal**.

"Our invoices come through different channels. Each has its own workspace. Msetu/SRM is for standard PO invoices. The PO Portal is for plant service POs.

The Register shows the current state of each invoice. History shows what changed and when. The Columns menu lets the team choose what to see: a standard view, approvals, every SRM field, or a custom set.

For PO Portal invoices we also show service entry and HOD approval details, so the team can see who an invoice is waiting on."

### Screen 8: Inquiry Desk (2 min)

**Click:** **Inquiry Desk**. Show the tiles, switch between **List** and **Board**. Open the supplier's query, assign it, reply, mark it resolved.

"Every supplier query lands here. The tiles show open, in progress, SLA breached and resolved.

Each query has a category, a priority, an owner and a service-level timer. If a query is about to breach its timer, we see it before the supplier complains.

I'll open the query from earlier, assign it to a team member, reply with the payment date, and resolve it. The supplier is notified straight away."

### Screen 9: Reports, suppliers and control (2 min)

**Click:** **Vendor Status Reports**, then **Settings** and show **Supplier Management**, **Roles & Permissions** and **Audit Logs**.

"For management, the Vendor Status Reports show completed invoices, suppliers covered, paid value and the top supplier. I can drill down from a supplier to its invoices.

In Settings, the team manages supplier accounts: approving access requests, activating or deactivating accounts, and assigning vendor codes.

Roles and permissions decide who can export, search, view reports or manage users. Every sensitive action is recorded in the audit log. So we have visibility for suppliers and control for us."

---

## 3. Business benefits

"Let me summarise what this gives the business.

1. **Fewer calls and emails.** Suppliers check status themselves, any time.
2. **Faster answers.** The Invoice Team finds any invoice in seconds and works every query with an owner and a timer.
3. **One view across channels.** Msetu/SRM and PO Portal in one place.
4. **Better cash-flow planning.** Upcoming and overdue payments are visible to suppliers and to us.
5. **Fewer rejected-invoice delays.** Rejections show the reason, so suppliers fix them quickly.
6. **Control and audit.** Role-based access, supplier data separation, and a full audit trail."

---

## 4. Expected questions and answers

**Q1. Where does the invoice data come from, and how fresh is it?**
A. It comes from our invoice payment tables for SRM and the PO Portal. The portal can read them live from the internal data service or from loaded files. After a restart, the last saved copy is shown straight away while fresh data loads in the background. [Confirm the refresh frequency with IT before the meeting.]

**Q2. Can one supplier see another supplier's invoices?**
A. No. Each supplier sees only the vendor codes assigned to them, and the check is done on the server for every request.

**Q3. How does a supplier get an account?**
A. Two ways. Our team creates the account and sends a one-time setup link, or the supplier requests access with company, PAN and vendor codes and a manager approves it.

**Q4. How is the invoice status decided?**
A. If there is a bank reference (UTR) or a clearing date, it is Paid. Otherwise, if it is booked in SAP, it is Miro Booked. Otherwise the approval flag decides: pending, approved, rejected or deleted.

**Q5. What if an invoice is rejected?**
A. It appears under "Needs attention" with the reason. The supplier corrects it and resubmits, or raises a query.

**Q6. How is "overdue" calculated?**
A. From the payment due date, which comes from the payment term. An invoice is overdue when the due date has passed and it isn't paid.

**Q7. What are "Entry Deleted" invoices?**
A. Entries removed at source. Suppliers never see them. Internal users can still see them for audit.

**Q8. What happens when a supplier raises a query? Is there an SLA?**
A. The query gets a category, priority, owner and a service-level timer. Breaches show on the Inquiry Desk. [Share the actual SLA hours configured.]

**Q9. Who can download the data?**
A. Only roles with export permission. Admin can change this under Roles and Permissions.

**Q10. Does it cover foreign-currency (MFOX) invoices?**
A. The logic exists but that channel is switched off for now. We can enable it when the business is ready.

**Q11. Do suppliers get email notifications?**
A. They get in-portal notifications for query updates and emails for account approvals and password links. [Confirm further email alerts with IT.]

**Q12. How will suppliers learn to use it?**
A. There are user manuals with screenshots for each role, and a helpdesk email and phone number on the login page.

---

## 5. Closing (1 min)

"To close, three points. First, suppliers get transparency: where their invoice is and when they will be paid. Second, our Invoice Team gets one workspace to find, track and answer. Third, the business gets control: permissions, separation of supplier data, and an audit trail.

For next steps, I suggest a pilot with a small group of suppliers, a short feedback round, and then a go-live date. Thank you. I'm happy to take questions or show anything again."

---

## Notes for the presenter

- If a screen is slow, say: "The first load pulls the full invoice set; after that it is quick."
- If a question is outside what is shown, say: "Good point. I'll confirm and come back to you." Don't guess.
- Items in [square brackets] need a fact from IT or the business owner before the meeting.
