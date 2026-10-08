# Phase 0 Audit: Tickets & Inquiry Desk

This audit evaluates the current state of the repository against the proposed "Architecture and Implementation Plan" for the Ticket/Inquiry Desk feature.

## 1. Migrations & DB Tool
* **Planned:** Use Alembic (or existing tool) with reversible additive migrations.
* **Existing:** The backend currently uses `Base.metadata.create_all(bind=engine)` in `main.py` on startup. There is no Alembic or other migration tool installed.
* **Decision:** Introduce Alembic to the project (`alembic init`) to manage schema changes properly. We will create a baseline migration and then an additive migration for this feature.

## 2. Existing Data Models
* **Planned:** `id` as `BIGINT UNSIGNED`, dates as `DATETIME`, enums for status/priority.
* **Existing:** `tickets` and `ticket_comments` tables exist.
  * `tickets.id` is `String(16)`.
  * Date columns (`raised_date`, `resolved_date`, `date`) are `String(32)`.
  * Status, priority, etc. are basic `String`.
* **Decision:** Following the rule to "follow the repo's conventions and report the difference" and "never drop or rename existing columns", we will keep `tickets.id` and `ticket_comments.ticket_id` as `String` types instead of migrating them to `BIGINT UNSIGNED`. We will also keep existing date columns as `String` but parse/format them in the application layer, or add the new date columns (`response_due_at`, `first_response_at`, `created_at`, `updated_at`) as proper `DATETIME` columns.

## 3. JWT & Authentication
* **Planned:** Scope and roles derived from JWT.
* **Existing:** `auth.py` sets `auth_type="supplier"` with `sub=vcode`, and `auth_type="internal"` with `sub=user_id` and `scope={"channelScope": ...}`.
* **Decision:** We will use the existing JWT payload structure. Suppliers are authenticated by `vcode` (`payload.get("sub")`), and internals by `user_id` and `channelScope`.

## 4. Layered Architecture
* **Planned:** `api → services → repositories → models`
* **Existing:** The current `/tickets` endpoints (in `api/v1/tickets.py`) contain raw ORM queries and direct business logic.
* **Decision:** The existing routes will be refactored to delegate to `ticket_service.py` and `ticket_repository.py`.

## 5. Jobs, Storage, and Email
* **Planned:** Small worker/scheduler for SLAs, outbox email sender, file storage for attachments.
* **Existing:** No scheduler, email, or file storage mechanism exists in the repo currently.
* **Decision:**
  * **Scheduler:** Use `APScheduler` running in the FastAPI background (or as a separate lightweight worker) for SLA breach scans and auto-close.
  * **Storage:** Store attachments on the local disk (`backend/data/attachments/`) behind a FastAPI streaming endpoint.
  * **Email:** Implement a mock email service that logs to stdout for V1.

## Migration Delta
We will add the following via Alembic:
1. **tickets:** Add `channel`, `fy`, `vendor_code`, `invoice_id`, `awaiting`, `source`, `assignee_id`, `response_due_at`, `first_response_at`, `closed_at`, `reopen_count`, `row_version`, `created_at`, `updated_at`.
2. **ticket_comments:** Add `author_id` (since `author` is currently a string), `visibility`, `created_at`.
3. **New Tables:** `ticket_activity`, `ticket_attachments`, `sla_policies`, `ticket_reads`, `notifications`.
   *(Note: Foreign keys referencing `tickets.id` will be created as `String` to match the existing column).*
