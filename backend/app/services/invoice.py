from datetime import date
from decimal import Decimal

from app.repositories.gcp_invoice import (
    get_invoice_by_number,
    get_invoices as get_gcp_invoices,
)
from app.schemas.invoice import (
    InvoiceResponse,
    PurchaseOrderResponse,
    SupplierResponse,
    ApproversResponse,
    WorkflowResponse,
    SAPResponse,
)


def _to_str(value):
    if value is None:
        return None

    value = str(value).strip()

    if value == "":
        return None

    return value


def _to_date(value):
    if value is None or value == "":
        return None

    if isinstance(value, date):
        return value

    return None


def _to_decimal(value):
    if value is None or value == "":
        return None

    return Decimal(str(value))


def _to_int(value):
    if value is None or value == "":
        return None

    return int(value)


def map_gcp_invoice_to_response(row: dict) -> InvoiceResponse:

    return InvoiceResponse(
        invoice_number=_to_str(row["INV_NO"]),
        invoice_date=_to_date(row["INV_DT"]),
        invoice_type=(
            "Service"
            if _to_str(row["DOC_TYPE"]) == "S"
            else _to_str(row["DOC_TYPE"])
        ),
        status_flag=_to_str(row["STATUS_FLAG"]),
        overall_status=_to_str(row["OVERALL_STATUS"]),

        purchase_order=PurchaseOrderResponse(
            po_number=_to_str(row["PO_NO"]),
            po_item=_to_int(row["PO_ITEM"]),
        ),

        supplier=SupplierResponse(
            vendor_code=_to_str(row["SUPPLIER"]),
            supplier_name=_to_str(row["SUPPLIER_NAME"]),
            pan=_to_str(row["PAN_NO"]),
        ),

        workflow=WorkflowResponse(
            approved_by=_to_str(row["APPROVED_BY"]),
            pending_with=_to_str(row["PENDING_WITH"]),

            approvers=ApproversResponse(
                approver_1=_to_str(row["APPROVER1"]),
                approver_2=_to_str(row["APPROVER2"]),
                approver_3=_to_str(row["APPROVER3"]),
                approver_4=_to_str(row["APPROVER4"]),
                approver_5=_to_str(row["APPROVER5"]),
                approver_6=_to_str(row["APPROVER6"]),
                approver_7=_to_str(row["APPROVER7"]),
            ),

            workflow_levels=_to_int(row["WF_LEVELS"]),
            current_workflow_level=_to_int(row["C_WF_LEVEL"]),
            workflow_steps=_to_str(row["WF_STEPS"]),
            rejection_reason=_to_str(row["REJ_REASON"]),
            accountant=_to_str(row["ACCOUNTANT"]),

            document_sent_to_accounts_date=_to_date(
                row["DOC_SENT_ACC"]
            ),

            final_approval_date=_to_date(
                row["FINAL_APPR_DT"]
            ),

            approver_remarks=_to_str(row["APPR_REMARKS"]),
        ),

        sap=SAPResponse(
            miro_document=_to_str(row["MIRO_DOCUMENT"]),
            company_code=_to_str(row["MIRO_COMPANY_CODE"]),
            fiscal_year=_to_int(row["MIRO_FISCAL_YEAR"]),
            document_type=_to_str(row["MIRO_DOCUMENT_TYPE"]),
            document_date=_to_date(row["MIRO_DOCUMENT_DATE"]),
            posting_date=_to_date(row["MIRO_POSTING_DATE"]),
            reference=_to_str(row["MIRO_REFERENCE"]),
            currency=_to_str(row["MIRO_CURRENCY"]),
            amount=_to_decimal(row["MIRO_AMOUNT"]),
            amount_local_currency=_to_decimal(row["MIRO_AMOUNT_LC"]),
            cash_discount_base=_to_decimal(row["MIRO_CD_BASE"]),
            po_number=_to_str(row["MIRO_PO_NO"]),
            po_item=_to_int(row["MIRO_PO_ITEM"]),
            net_due_date=_to_date(row["MIRO_NET_DUE_DATE"]),
            baseline_date=_to_date(row["MIRO_BASELINE_DATE"]),
            account_type=_to_str(row["MIRO_ACCOUNT_TYPE"]),
            posting_key=_to_str(row["MIRO_POSTING_KEY"]),
            clearing_date=_to_date(row["MIRO_CLEARING_DATE"]),
            clearing_document=_to_str(row["MIRO_CLEARING_DOCUMENT"]),
            clearing_fiscal_year=_to_int(
                row["MIRO_CLEARING_FISCAL_YEAR"]
            ),
            clearing_status=_to_str(row["MIRO_CLEARING_STATUS"]),
            utr_number=_to_str(row["UTR_NO"]),
        ),
    )


def get_gcp_invoice_response(
    invoice_number: str
) -> InvoiceResponse | None:

    row = get_invoice_by_number(invoice_number)

    if row is None:
        return None

    return map_gcp_invoice_to_response(row)



def get_gcp_invoice_list(
    page: int = 1,
    page_size: int = 20,
    status: str | None = None,
    vendor_code: str | None = None,
    invoice_number: str | None = None,
    po_number: str | None = None,
    po_item: int | None = None,
):
    rows, total = get_gcp_invoices(
        page=page,
        page_size=page_size,
        status=status,
        vendor_code=vendor_code,
        invoice_number=invoice_number,
        po_number=po_number,
        po_item=po_item,
    )

    invoices = [
        map_gcp_invoice_to_response(row)
        for row in rows
    ]

    return invoices, total