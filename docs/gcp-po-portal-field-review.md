# GCP datasource and PO Portal field review

Reviewed on 22 October 2026 against the current source code, the existing backend Excel datasource, functional specification 8000276074 revision 1.2, and the supplied requirements workbook.

This is an analysis only. No application code, environment configuration, source documents, or databases were changed. Statements in the supplied documents are treated as requirements evidence, not operational instructions.

## Findings

The application still reads Excel. `backend/app/repositories/gcp_invoice.py` loads `backend/data/gcp_invoice_data.xlsx`, sheet `in`, through openpyxl and caches the records indefinitely in process memory. Its name does not indicate a working GCP connection. The backend requirements do not currently include a GCP datasource client.

The existing file contains 2,702 rows and 49 columns. It already supplies supplier, PO, SRM approval, MIRO, due-date, clearing and UTR data. It does not have `DOC_UPLOAD_DT`, `ASN_SC_NO`, `WERKS`, a source channel column, or the PO Portal process fields.

PO Portal navigation and views already exist in the frontend. However, `toWorkspaceInvoice` assigns every API invoice to `msetuSrm`; the summary endpoint also assigns every row to SRM; ticket creation derives the same fixed channel. The existing PO Portal views therefore do not constitute a live PO Portal integration.

The supplied Excel is a requirements workbook with `SRM`, `PO portal`, and empty `Forex` sheets. It is not a sample of the future GCP output schema. The FS does not identify the GCP service, project, dataset, tables/views, authentication method, or refresh contract. BigQuery must not be assumed without confirmation.

## Fields to add for both channels

API names below are proposals. SAP names and business rules come from the supplied references; application metadata is identified separately.

| Field | Proposed application field | Required handling |
| --- | --- | --- |
| Source channel | `channel` | Application metadata identifying `msetuSrm` or `poPortal`; derive from the actual source, rather than defaulting every row to SRM. |
| Stable source record key | `source_record_id` | Integration metadata required for reliable detail lookup and linking. Obtain the source key; do not assume invoice number or invoice plus PO item is unique. |
| `DOC_UPLOAD_DT` | `invoice_upload_date` | Actual attachment upload date. Keep null if no matching attachment exists. Do not substitute invoice date, invoice creation date, or MIRO posting date. |
| Attachment match result | `invoice_uploaded` | Derived YES/NO or boolean, separate from upload date and overall lifecycle status. Agree whether attachment existence or nonblank attachment content determines YES. |
| `WERKS` | `plant_code` | Required for the SRM division rule. PO Portal plant source is not specified. |
| Derived division | `division` | First plant character: A = AUTO DV; F = FORM DV; S/H = Corporate DV; other or blank = Unmapped, flagged for validation. The supplied rule explicitly uses SRM `WERKS`. |

SRM attachment join: `ZSRM_INVOICE_IBD.ASN_SC_NO` to `ZZSRM_ASN_ATTACH.ASN_NO`, returning `DOC_UPLOAD_DT`.

PO Portal attachment join: `ZZMM_LABOUR_HDR.REF_DOC_NO` to `ZZSRM_ASN_ATTACH.ASN_NO`, returning `DOC_UPLOAD_DT`.

Keep `ASN_SC_NO`/attachment join identifiers in the source query or extraction layer. They need not become visible dashboard columns. If the attachment table returns multiple matches, define which upload date applies before implementing the join.

## Minimum PO Portal mapping

These fields support the existing invoice log, service-entry view, approval detail, MIRO/payment progress, and drill-down. They are the proposed first implementation scope, rather than all 54 fields listed in the FS.

| Source field | Proposed destination/use | Existing or new |
| --- | --- | --- |
| `REF_DOC_NO` | Invoice reference used for attachment and MIRO matching; candidate displayed invoice number, pending business confirmation | New source mapping |
| `EBELN`, `EBELP` | `purchase_order.po_number`, `purchase_order.po_item` | Reuse existing response fields |
| `LIFNR` | `supplier.vendor_code` | Reuse; normalize consistently with login and vendor filtering, preserving identifier semantics |
| `LFA1.NAME1`, `LFA1.J_1IPANNO` | Supplier name and PAN | Reuse response fields; confirm PO supplier join because reference text repeats the SRM source |
| `REQ_NO` | `po_portal.request_number` | New, for request drill-down |
| `SRVPOS`, `SRV_ITEM` | Service and service line identifiers | New; preserve service-line grain and investigate use in the true source key |
| `GR_NO`, `GR_DATE` | `po_portal.entry_sheet_number`, `entry_sheet_creation_date` | New; replace generated service-entry numbers and dates |
| `ERNAM`, `ERDAT` | Request/entry creator and source record creation date | New; confirm which creator belongs to the service-entry display |
| `INV_ERDAT` | `po_portal.invoice_creation_date` | New; distinct from upload date. Its use as generic `invoice_date` requires confirmation |
| `ACC_STATUS` | Accounts approval state | New; SC = Pending Approval, APPROVED = Approved, per FS |
| `HOD1`, `HOD2`, `HOD1_STATUS`, `HOD2_STATUS` | PO approval participants and states | New; keep PO workflow semantics instead of inventing SRM approver levels |
| `ACCOUNTS` | Accounts participant | New source mapping into workflow detail |
| `COMMENTS`, `REJ_COMMENT` | Source comments and edit rejection comment | New; retain distinct meanings, and expose according to supplier visibility policy |
| `PARK_OR_POST`, `PARK_ERDAT`, `POST_ERDAT` | Park/post state and dates | New; parking alone must not be treated as booked MIRO |
| `BELNR`, `MIRO_GJAHR`, `MIRO_ERDAT`, `MIRO_ERNAM` | MIRO document, year, creation date and user | Reuse matching SAP fields where meanings align; add creator if needed |

Preserve `DOCNR` and `GJAHR` as separate source identifiers when needed for drill-down or identity; do not merge them with `BELNR` and `MIRO_GJAHR` merely because both are called document/year.

The FS specifies PO MIRO booking through a `REF_DOC_NO` reference match with document type RE. The actual replicated table and join keys must be confirmed; the references contain `RESG`/`RSEG` inconsistencies. Do not silently treat the listed table names as a verified GCP schema.

### Fields to include only when their use is confirmed

| Source fields | Reason to defer from visible dashboard scope |
| --- | --- |
| `LMNR`, `LYEAR`, `SR_NO` | Period and serial data; retain if required by the source key or period filters. |
| `PO_QTY`, `SETUP_COUNT`, `PO_STATUS` | Quantity and daily-count reporting is not present in the current invoice dashboard. |
| `REF_DATE`, `KOSTL`, `ACTIVITY`, `PO_TYPE`, `PU_NAME` | Price reference, allocation and classification details; add for an agreed filter, routing rule, or drill-down. |
| `REQ_EDIT`, `STATUS1`, `GST_USER`, `GST_STATUS` | Additional edit/approval/GST state; add when needed to explain the agreed progress or pending owner. |
| `ERZET`, `INV_ERNAM`, `PARK_ERNAM`, `POST_ERNAM`, `CLAIM_NO`, `MIRO_ERZET` | Detailed audit/drill-down metadata beyond the first dashboard views. |
| `ETAG`, `PO_PUSH_FLAG`, `LINE_INDEX` | Technical/change/routing fields. Retain internally if required for identity, deduplication, incremental refresh, or SRM-to-PO handoff; no default UI requirement. |

Deferring a field from UI scope does not authorize dropping a field that the source key, joins, workflow derivation or reconciliation needs.

## Existing payment fields need corrected mapping

The current response already includes MIRO document/company/year, posting date, currency, amount, local amount, cash-discount base, due date, baseline date, clearing document/year/date/status and UTR. These are primarily migration mappings, not new UI fields.

The FS specifies payable amount from `BSEG.DMBTR` for vendor account type K. The Excel repository currently overwrites both `MIRO_AMOUNT` and `MIRO_AMOUNT_LC` with `MIRO_CD_BASE`; the frontend and ticket summary also prefer the cash-discount base. Introduce an explicit payable amount mapping, or agree which existing amount field holds that value, and remove the conflicting selection logic throughout. Preserve amount currency and grain; a vendor accounting amount repeated across PO lines must not be summed multiple times.

The FS provides a due-date calculation using baseline date and payment-term day fields. Either consume a confirmed computed due date from the GCP view or retain `ZFBDT`, `ZBD1T`, `ZBD2T`, `ZBD3T` internally and apply the agreed rule. There is no requirement to display all payment-term inputs as new columns.

Keep separate facts for attachment uploaded, approval state, MIRO booked, due date and payment evidence. An overall status alone cannot express them all. Current code marks Paid from UTR alone and Payment Due from any due date. The references describe UTR plus clearing evidence and do not fully define overall-status precedence, future due dates, rejection after booking, or partial payments. Agree those cases before replacing the status derivation.

SRM raw flags listed in the references are A, P, I, L, D, X, Y and N. N means pushed to PO Portal; it requires an agreed handoff/deduplication rule and must not be treated automatically as rejection or payment. Current data contains P, A, X, I, D and Y, so it cannot validate L or N behavior.

## Code areas affected

| Area | Required work |
| --- | --- |
| `backend/app/repositories/gcp_invoice.py` | Replace Excel loading with the confirmed GCP datasource; source-side projection, filtering, stable pagination, sorting, and aggregates; explicit freshness behavior. |
| `backend/app/services/invoice.py` | Separate source adapters for SRM and PO Portal into a shared response; map aliases and types; keep dates, amounts and workflow states distinct. Current direct `row[...]` access assumes the complete old Excel schema. |
| `backend/app/schemas/invoice.py` | Add channel, stable identity, upload facts, plant/division and the agreed PO-specific detail. Reuse existing supplier/PO/SAP response fields. |
| `backend/app/api/v1/invoice.py` | Channel-aware list/detail/summary/recent; actual global recent sorting before limit; source-level scoping and supplier redaction for newly exposed workflow data. |
| `backend/app/api/v1/auth.py` | Supplier login currently searches the full cached invoice list. Preserve PO-only supplier lookup and avoid a full cloud invoice scan for each login. |
| `backend/app/services/ticket_service.py` | Derive channel from the invoice; use reliable invoice identity in create/detail linking; align amount mapping. Review whether ticket schema needs a source key migration. |
| `frontend/src/api/invoiceApi.js` | Remove fixed SRM channel; pass new fields into runtime data; use actual upload date and explicit payable amount. |
| `frontend/src/features/bootstrap/hydrateThunks.js` | Review prototype fallback and loading every page at login. A cloud-backed application needs bounded data loading rather than an unconditional whole-source download. |
| `frontend/src/utils/businessLogic.js` | Replace generated `SE-...` and `MIRO-...` identifiers, synthetic creators and date-plus-30 due dates with source values. |
| Invoice tables, filters, detail/progress views and exports | Present upload date separately; add agreed plant/division and PO detail; retain stable identity in navigation. |
| Environment example and dependencies | Add configuration for the confirmed GCP service and source objects; keep the operational SQL database configuration for users, tickets, settings and audit data. |

The invoice endpoints currently enforce supplier vendor scope but do not apply an internal user's channel scope. As PO data is added, enforce allowed internal channels on the backend for list, detail, recent and summaries; frontend selectors alone are insufficient.

## Identity and reconciliation

The current datasource has 69 distinct `(SUPPLIER, INV_NO, PO_NO, PO_ITEM)` combinations occurring more than once. This does not prove those rows are accidental duplicates: workflow, document, service or accounting grain may distinguish them. It proves this proposed combination is not unique in the current sample. Do not collapse rows until their grain is established.

Current detail lookup matches invoice number, optionally PO item, and falls back to the first invoice match even when the requested PO item is absent. The frontend and tickets also have invoice-number-based lookups. Obtain source keys for both channels and use them consistently, including supplier-scoped detail queries, before relying on cross-channel identifiers.

Reconcile both source row counts and business invoice counts. Decide whether dashboard counts represent invoices, PO items, service lines or accounting items. Check totals at the payable-amount grain and explicitly test an SRM invoice handed off to PO Portal.

## Required clarifications before implementation

1. Identify the GCP service and provide the source schema/view definitions, keys and sample rows for both channels, plus the refresh expectation and access method. These are absent from the supplied references.
2. Confirm whether `REF_DOC_NO` is the supplier-facing invoice number, and what date represents a PO invoice's business invoice date. `INV_ERDAT` is labelled creation date; `REF_DATE` is labelled price reference date.
3. Confirm the PO Portal plant source. The workbook's PO plant section is empty, and the FS division rule specifies only SRM `WERKS`.
4. Resolve reference inconsistencies: `RESG` versus `RSEG`; field locations for reference/document type/posting date; `GJHAR` spelling; company-aware accounting joins; PO supplier enrichment copying SRM text; `PARK_ERNAM` pointing to `ERNAM`; `LINE_INDEX` pointing to a table-like name; SRM remarks labelled SAP field `A` while logic names `REMARK`.
5. Confirm multiple-attachment selection, approval/status precedence, clearing evidence for Paid, amount currency/grain, source key, and SRM push-to-PO deduplication.

These questions concern the source contract; no live GCP connection or SAP table metadata was available to verify them. The review does not claim the document's SAP joins are technically validated.

## Suggested implementation order

1. Agree the GCP source contract, field aliases, record grain and keys.
2. Build and reconcile SRM and PO adapters into the shared response, including upload and division derivations.
3. Update backend scoping, identity, summaries, supplier lookup and ticket context.
4. Wire existing PO screens to actual source fields and update dates/amounts in shared views.
5. Validate representative SRM and PO records, no attachment, multiple attachments, plant A/F/S/H/blank/other, SC/APPROVED, parked versus posted, missing PO item, repeated invoice numbers, paid/unpaid records and SRM-to-PO handoff. Reconcile counts and payable totals against source controls before switching the datasource.

## Reference locations

- Functional specification: `C:/Users/tileh/Downloads/FS__8000276074-Invoice to payment dashboard (1).docx`, revision history, Scope, SRM, PO portal, Status Logic and plant bifurcation logic sections.
- Requirements workbook: `C:/Users/tileh/Downloads/Invoice to payment dashboard_8000276074.xlsx`, SRM rows 3–24, 27–40, 44–51; PO portal rows 3–56 and 60–81. Forex is empty.
- Existing datasource: `backend/data/gcp_invoice_data.xlsx`, sheet `in`; inspected read-only for headers, row count, status flags and repeated candidate keys.

Verification was static source review and read-only document/workbook extraction. No application tests, database migrations, cloud queries or application launches were run for this analysis.
