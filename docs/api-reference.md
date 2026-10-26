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

| Method | Endpoint | Purpose / when to call | Query parameters |
|---|---|---|---|
| GET | `/api/v1/invoices/list-invoices` | Load a page of invoices for invoice lists and supplier invoice views. | `page`, `page_size`, `status`, `vendor_code`, `invoice_number`, `po_number`, `po_item` |
| GET | `/api/v1/invoices/invoice-summary` | Load invoice totals and status counts for summary cards. | `vendor_code` |
| GET | `/api/v1/invoices/recent-invoices` | Load the most recent invoices. | `limit`, `vendor_code` |
| GET | `/api/v1/invoices/invoice-details/{invoice_number}` | Load one invoice and its details. | `po_item` (optional) |
| GET | `/api/v1/load-workspace-data` | Bootstrap the current workspace, including settings and other initial page data. | None |
| GET | `/api/v1/sync-log` | Load invoice synchronization history. | None |

Invoice list responses are paginated. The backend applies supplier vendor-code restrictions from the authenticated token; a supplier cannot use a query parameter to access another supplier’s invoices.

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
