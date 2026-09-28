# Client demo runbook

A ~10 minute walkthrough showing the app running on a real MySQL database with a
genuine login → logout flow.

## Before the call

```bash
npm install
cp server/.env.example server/.env      # set DB_PASSWORD
npm run seed                            # fresh demo data in `mahindra_i2p`
npm run dev:all
```

Open the web URL Vite prints (usually http://localhost:5173).

Keep a terminal open for the "look, it's really in the database" moment:

```bash
mysql -u root -p mahindra_i2p
```

## Script

1. **Login is real.** On the login screen, enter `admin` / `admin123`, portal
   *All Channels*. Point out: the password is checked with bcrypt against the
   `users` table; a bad password is rejected by the server, not the browser.

2. **Data comes from MySQL.** The Invoice Tracking page is populated by
   `GET /api/workspace` → `SELECT * FROM invoices`. Nothing is hard-coded.

3. **Advance an invoice.** Invoice Tracking → click `INV-MS-1003` → *Mark
   Approved* (then *Mark Booked*, …; the last step asks for a UTR). Each click
   writes `PATCH /api/invoices/INV-MS-1003` and the stage position follows.

4. **Raise a ticket.** Inquiry Desk → raise a query on any invoice row → submit.
   Switch to the **Board** view and drag the new card from Open to In Progress.

5. **Change a permission.** Settings → Roles & Permissions → toggle any cell.

6. **Show the database.** In the mysql terminal:

   ```sql
   SELECT id, status, priority FROM tickets ORDER BY id DESC LIMIT 3;
   SELECT no, status, stage_index FROM invoices WHERE no = 'INV-MS-1003';
   SELECT role_matrix_json FROM settings;
   ```

   The ticket, the stage move, and the permission change are all there.

7. **Persistence across restart.** In the `dev:all` terminal press `Ctrl+C`,
   then `npm run server` again, and reload the browser. Every change from steps
   3–5 is still present — it was never in browser memory.

8. **Logout is real.** Click Logout. You land back on the login screen; the
   session row is deleted server-side, so the browser Back button cannot
   re-enter the app.

9. **Supplier view.** Log in on the Supplier tab with a vendor code such as
   `DIT00388AC` (an unknown code is rejected). The app re-scopes to exactly that
   vendor code's invoices and queries — and the server only sends that data.

## Reset between runs

```bash
npm run seed
```
