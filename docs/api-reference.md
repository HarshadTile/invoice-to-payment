# Invoice to Payment Tracker API Reference

This document describes the documented backend API routes and the purpose of each route. It is based on the FastAPI OpenAPI schema. Routes marked as compatibility aliases are intentionally omitted; clients should use the paths listed here.

## API basics

- **Base path:** `/api/v1`
- **Interactive API reference:** run the backend and open `/docs` (Swagger UI) or `/redoc` (ReDoc).
- **Authentication:** protected routes require `Authorization: Bearer <access-token>`. Sign in first using the appropriate internal or supplier login route.
- **Request format:** JSON request bodies use `Content-Type: application/json`, except attachment uploads, which use `multipart/form-data`.
- **Path parameters:** values in braces, such as `{ticket_id}`, are replaced with the relevant record ID or invoice number.
- **Authorization scope:** backend permissions depend on the authenticated account. Supplier invoice and ticket results are scoped to that supplier’s assigned vendor codes; internal users’ access follows their role and channel permissions. Admin-only routes enforce admin access on the server.

The application uses these routes for its screens and actions. Some backend routes are also available for integrations or administrative clients and may not currently have a dedicated UI action.

## Authentication and account access

| Method | Endpoint | Purpose / when to call | Request parameters or body |
|---|---|---|---|
| POST | `/api/v1/auth/login` | Sign in an internal team member. | `InternalLoginRequest` JSON |
| POST | `/api/v1/auth/supplier/login` | Sign in a supplier using the supplier login flow. | `SupplierLoginRequest` JSON |
| POST | `/api/v1/auth/supplier/login-with-password` | Sign in a supplier with PAN and password. | `SupplierPasswordLoginRequest` JSON |
| POST | `/api/v1/auth/logout` | End the current session. | Bearer access token |
| GET | `/api/v1/auth/me` | Load the signed-in account and session details. | Bearer access token |
| POST | `/api/v1/auth/forgot-password` | Request a password reset link. | `ForgotPasswordRequest` JSON |
| POST | `/api/v1/auth/password-link-info` | Check link details, such as its type or expiry, before using it. | `PasswordLinkInfoRequest` JSON |
| POST | `/api/v1/auth/reset-password` | Complete an account setup or password reset using its one-time token. | `ResetPasswordRequest` JSON |
| GET | `/api/v1/auth/supplier/check-setup-link?token={token}` | Check a supplier setup link before showing the setup form. | `token` query parameter |
| POST | `/api/v1/auth/supplier/complete-supplier-setup` | Set the supplier’s password and complete account activation. | `SupplierSetupRequest` JSON |

## Invoices and workspace

PO Portal source fields, status precedence, channel filters and service-line
identity are documented in [PO Portal mapping](po-portal-mapping.md).

| Method | Endpoint | Purpose / when to call | Query parameters |
|---|---|---|---|
| GET | `/api/v1/invoices/list-invoices` | Load a page of invoices for invoice lists and supplier invoice views. | `page`, `page_size`, `status`, `vendor_code`, `invoice_number`, `po_number`, `po_item` |
| GET | `/api/v1/invoices/invoice-summary` | Load invoice totals and status counts for summary cards. | `vendor_code` |
| GET | `/api/v1/invoices/recent-invoices` | Load the most recent invoices. | `limit`, `vendor_code` |
| GET | `/api/v1/invoices/invoice-details/{invoice_number}` | Load one invoice and its details. | `po_item` (optional) |
| GET | `/api/v1/load-workspace-data` | Bootstrap the current workspace, including settings and other initial page data. | None |
| GET | `/api/v1/sync-log` | Load invoice synchronization history. | None |

Invoice list responses are paginated. The backend applies supplier vendor-code restrictions from the authenticated token; a supplier cannot use a query parameter to access another supplier’s invoices.

Invoices whose current effective status is `Entry Deleted` (or legacy `Deleted`)
are excluded from supplier list, summary, recent and detail endpoints before
pagination and counting. Direct supplier detail requests return 404. This is a
server-enforced rule, not a client-controlled filter. Internal users retain the
entries and their status filter. Existing payment/MIRO status precedence remains
unchanged. Supplier tables, logs, exports, status options and detail links also
exclude deleted entries, including any rows left in an older browser dataset.

The list, summary, and recent invoice endpoints also accept `product_type` (`S` = Service,
`M` = Material), `plant`, `dv_type` (Division, from `DV_TYPE`), `upload_date_from`, `upload_date_to` (inclusive ISO dates),
and `filter_fiscal_year` (source ending year, e.g. `2027` for FY 2026–27).
Choose a date with `date_type` (`invoice`, `upload`, `approval`, `miro`, `due`,
`payment`, `posting`, `accounts`, or `utr_clearing`), then supply `date_from`
and/or `date_to` as inclusive ISO dates. Rows without the selected date are
excluded when either bound is supplied. `accounts` is internal-only. Existing
`upload_date_from`/`upload_date_to` remain available as independent upload filters.
Summary and recent endpoints accept the same invoice/vendor/PO/status filters as the list.
Internal SRM queries also accept `approver` (case-insensitive partial match across
Approvers 1–7), `pending_with`, and `approved_by` (case-insensitive partial matches).
Suppliers cannot use these internal approval filters. `miro_status=booked|pending`
matches the actual MIRO status; `payment_status=paid|unpaid` follows UTR/clearing
payment evidence. Missing MIRO status is not treated as pending.

The internal SRM workspace applies one invoice search and filter set across Invoice
Log, Approver Assignment, SAP Booking, Payment & UTR, and History. Its controls
are master search, Status, Date Type and From/To dates. Product Type, Plant,
Division, Approver, Pending With, Approved By, MIRO Status and Payment Status
dropdowns have been removed from SRM; search the relevant table value instead.
Obsolete SRM URL parameters are removed and saved filters are restricted to the
remaining controls, so old hidden selections cannot narrow results. The backend
query parameters remain available to integrations. The common top bar retains
year, channel and vendor filters. The Columns menu
offers Standard (tab-specific), Approvals, All SRM fields, and custom selections.
Invoice number and vendor remain pinned. Column selections persist per tab for
the session. Exports include every matching row in the selected column order;
pagination does not restrict exports. History shows only actual dated milestones
and available query activity. Source fields omitted by the agreed SRM mapping are
not manufactured. The Payment & UTR tab includes unpaid invoices as well as paid
ones; the Status control can narrow the table to Paid invoices.

Invoice text search runs against the already authorized, scoped rows in memory.
The query is compiled once per search update, with a single pass producing rows
and status counts. Date filtering is reused while typing. Input updates take
priority over result rendering; exports are disabled while search results are
updating. Comma-position matching and exact PO-item matching are unchanged.
Free text covers mapped table/detail values: Service/Material, plant, division,
channel labels, PAN, financial year, status, amounts/currency, dates, approval
names/remarks and PO Portal service-entry/approval fields, in addition to invoice,
PO and UTR identifiers. Dates match ISO and displayed English dates, plus
day-month-year and day/month/year forms. Ungrouped amounts can match formatted
amounts (e.g. `1250.50` matches `₹1,250.50`). Commas remain the positional search
syntax. Indexes are prepared during invoice mapping, kept in a WeakMap and
refreshed after scalar or nested-field changes. Redacted values and metadata IDs
are excluded; the index never widens the supplied invoice scope.
`node scripts/benchmark-invoice-search.mjs` from `frontend` compares the old and
new filtering work on synthetic data; it does not measure end-to-end browser time.
Recent invoices are sorted across the matching source by `INVOICE_UPLOAD_DATE` before limiting.

Invoice data currently comes from `backend/data/tbl_dw_inv_paymt_SRM.xlsx`, sheet `in`.
The response includes `product_type`, `plant`, `invoice_upload_date`, `invoice_uploaded`,
`filter_fiscal_year`, `dv_type`, and `status_label` (the decoded `STATUS_FLAG`).
`sap.payable_amount` and the compatible `sap.amount` both use `PAYABLE_AMOUNT`;
cash discount base and other fields absent from SRM remain null. `FISCAL_YEAR` and
`STATUS_FLAG_APPROVED` are not used. `sap.miro_status` retains `MIRO_BOOKED`.
Approval, MIRO, and payment dates come from `FINAL_APPRPVAL_DATE`, `MIRO_DOCUMENT_DATE`,
and `CLEARING_DATE`, respectively. `sap.net_due_date` uses `NETDT` when supplied,
then the Excel `NET_DUE_DATE`, falling back to `Payment_Due_Date`; it does not drive
invoice status. The UI offers "Payment Due date" for this field; "Payment date"
and "Posting date" are excluded from the date-type dropdown. Their source fields
remain available in API responses.

Overall status precedence is: UTR number or clearing date → `Paid`; MIRO booked →
`Miro Booked`; otherwise decode `STATUS_FLAG`: D/Y → `Rejected`, X → `Entry Deleted`,
N → `Push to PO Portal`, L → `Level Approved`, A → `Approved`, P → `Pending for Approval`,
I → `Initial` (or `Invoice Uploaded` when `Invoice_Uploaded=YES`). Unknown codes remain
visible. Summary KPI `miroBooked` replaces the former Payment Due card; `paymentDue`
is retained as zero for compatibility. Legacy `Pending Approval` and `Deleted` status
query values are accepted. No GCP connection is configured by this mapping change.

## Internal user management

These routes are for managing internal team accounts. Create and access-link routes generate links for the user to set or reset their own password; they do not accept a password for the target user.

| Method | Endpoint | Purpose / when to call | Request |
|---|---|---|---|
| GET | `/api/v1/users/list-users` | Load users for the Settings → Users screen. | None |
| POST | `/api/v1/users/add-user` | Create an invited internal user and generate an account setup link. | `UserCreate` JSON |
| PATCH | `/api/v1/users/{user_id}/update-user` | Update an internal user’s name, email, role, status, channel, or ticket access. | `UserUpdate` JSON |
| DELETE | `/api/v1/users/{user_id}/delete-user` | Remove an internal user. | None |
| POST | `/api/v1/users/{user_id}/send-access-link` | Generate a setup link for an invited account or a password-reset link for an active account. | None |

## Supplier management

These management routes require an authorized internal account. Supplier-facing login and setup routes are in the authentication section.

| Method | Endpoint | Purpose / when to call | Query / request body |
|---|---|---|---|
| GET | `/api/v1/suppliers/list-suppliers` | Load the supplier directory and account statuses. | `status`, `search`, `channel` |
| POST | `/api/v1/suppliers/add-supplier` | Create a supplier account and assign its initial vendor codes. | `SupplierCreate` JSON |
| GET | `/api/v1/suppliers/search-vendors?q={query}` | Search the vendor directory while adding or updating supplier access. | `q` query parameter |
| POST | `/api/v1/suppliers/{supplier_id}/activate-supplier` | Activate a supplier account. | None |
| POST | `/api/v1/suppliers/{supplier_id}/deactivate-supplier` | Deactivate a supplier account. | None |
| DELETE | `/api/v1/suppliers/{supplier_id}/delete-supplier` | Delete a supplier account. | None |
| POST | `/api/v1/suppliers/{supplier_id}/generate-setup-link` | Generate a one-time account setup link to share with the supplier. | None |
| POST | `/api/v1/suppliers/{supplier_id}/reset-supplier-password` | Generate a supplier password reset link. | None |
| PUT | `/api/v1/suppliers/{supplier_id}/update-supplier-vendor-codes` | Change the vendor codes the supplier can access. | `VendorCodesUpdate` JSON |

## Tickets and queries

| Method | Endpoint | Purpose / when to call | Query / request |
|---|---|---|---|
| GET | `/api/v1/tickets/list-tickets` | Load tickets for internal and supplier ticket lists. | `page`, `page_size`, `status`, `channel`, `priority`, `assignee_id`, `vendor_code`, `invoice_no`, `sla`, `q`, `fy`, `include_closed` |
| POST | `/api/v1/tickets/create-ticket` | Create a ticket/query, usually from an invoice. | `TicketCreate` JSON; optional `Idempotency-Key` header |
| GET | `/api/v1/tickets/ticket-summary` | Load ticket counts for summary cards. | `channel`, `priority`, `vendor_code`, `invoice_no`, `fy` |
| GET | `/api/v1/tickets/ticket-board` | Load tickets grouped into board columns. | `channel`, `priority`, `fy` |
| GET | `/api/v1/tickets/list-assignable-users?channel={channel}` | Load team members eligible for ticket assignment in a channel. | `channel` query parameter |
| GET | `/api/v1/tickets/internal-activity-log` | Load the internal activity log across accessible tickets. | None |
| GET | `/api/v1/tickets/supplier-activity-log` | Load the supplier-visible activity log for accessible tickets. | None |
| GET | `/api/v1/tickets/{ticket_id}/ticket-details` | Load one ticket, including its current status and associated information. | None |
| GET | `/api/v1/tickets/{ticket_id}/list-comments` | Load comments on a ticket. | `after_id` for incremental retrieval (optional) |
| POST | `/api/v1/tickets/{ticket_id}/add-comment` | Add a comment to a ticket. | `TicketCommentCreate` JSON |
| POST | `/api/v1/tickets/{ticket_id}/assign-ticket` | Assign or reassign a ticket. | `TicketAssignRequest` JSON |
| PATCH | `/api/v1/tickets/{ticket_id}/update-ticket` | Update editable ticket fields. | `TicketPatchRequest` JSON |
| POST | `/api/v1/tickets/{ticket_id}/resolve-ticket` | Resolve a ticket. | `TicketResolveRequest` JSON |
| POST | `/api/v1/tickets/{ticket_id}/close-ticket` | Close a ticket. | `TicketCloseRequest` JSON |
| POST | `/api/v1/tickets/{ticket_id}/reopen-ticket` | Reopen a ticket. | `TicketReopenRequest` JSON |
| POST | `/api/v1/tickets/{ticket_id}/mark-as-read` | Mark a ticket as read for the current user. | None |
| GET | `/api/v1/tickets/{ticket_id}/ticket-activity` | Load activity events for one ticket. | None |
| POST | `/api/v1/tickets/{ticket_id}/upload-attachment` | Upload a ticket attachment. | `multipart/form-data`: file and attachment metadata |
| GET | `/api/v1/tickets/{ticket_id}/download-attachment/{attachment_id}` | Download an attachment after access checks. | None |

## Notifications

Notification list and count results are scoped to the authenticated user and their ticket access.

| Method | Endpoint | Purpose / when to call | Query / path parameters |
|---|---|---|---|
| GET | `/api/v1/notifications/list-notifications` | Load the current user’s notifications. | `unread`, `limit`, `offset` |
| GET | `/api/v1/notifications/unread-notification-count` | Get the exact unread count for the notification badge. | None |
| POST | `/api/v1/notifications/mark-all-as-read` | Mark all accessible notifications as read. | None |
| POST | `/api/v1/notifications/{notification_id}/mark-as-read` | Mark one accessible notification as read. | `notification_id` path parameter |
| POST | `/api/v1/notifications/ticket/{ticket_id}/mark-notifications-as-read` | Mark the current user’s notifications for one ticket as read. | `ticket_id` path parameter |

## Administration and shared data

| Method | Endpoint | Purpose / when to call | Request |
|---|---|---|---|
| GET | `/api/v1/admin/list-sla-policies` | Load ticket SLA policies. Admin-only. | None |
| PUT | `/api/v1/admin/update-sla-policies` | Update ticket SLA policies. Admin-only. | JSON array of `SlaPolicyIn` |
| GET | `/api/v1/ticket-permissions` | Load the ticket permission matrix. | None |
| PUT | `/api/v1/settings` | Update application settings such as roles and link expiry values. | `SettingsUpdate` JSON |
| GET | `/api/v1/tables/{table_key}` | Load a supported table-backed data set. | `table_key` path parameter |
| PUT | `/api/v1/tables/{table_key}` | Update a supported table-backed data set. | `TableUpdate` JSON |
| GET | `/health` | Check API process health. Does not require a user session. | None |

Password link expiry is configured separately for internal users and suppliers. Internal
fields `inviteLinkExpiryMinutes` and `resetLinkExpiryMinutes` require Manage Users.
Supplier fields `supplierInviteLinkExpiryMinutes` and `supplierResetLinkExpiryMinutes`
require Manage Suppliers. All four fields accept only 30, 60, 240, 720, 1440, 2880,
4320 or 10080 minutes and are included in the workspace settings. Setup defaults to
10080 minutes and reset to 1440 minutes. Changes affect newly issued links only.
Supplier add, setup-link generation and password-reset responses include `setupLink`,
`expiresAt` (UTC), `expiryMinutes` and `linkType` (`invite` or `reset`). Replacing a reset
link keeps its reset type and applies the current supplier reset duration.

## Compatibility and schema details

Portal availability is managed under Integration Settings with the `channelAvailability`
object on `PUT /api/v1/settings` (Manage Integration Settings permission). Keys are
`msetuSrm`, `poPortal`, and `mfoxPortal`, with strict boolean values; defaults are
`true`, `true`, and `false`. Workspace settings include the saved values. The public
`GET /api/v1/auth/portal-availability` endpoint returns only these flags for the login
picker and disables caching. Disabled portals are hidden from navigation and new-user
channel choices; internal and managed-supplier sign-ins to them return 403. Existing
account assignments and historical invoice data are retained.

Some previous route paths remain registered for older clients but are hidden from OpenAPI. New frontend and integration code should use the paths in this document. The current backend schema definitions—including exact request fields, validation rules, and response shapes—are available in Swagger UI at `/docs` and in the generated OpenAPI document at `/openapi.json`.
