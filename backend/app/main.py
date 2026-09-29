from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.invoice import router as invoice_router
from app.api.v1.auth import router as auth_router
from app.api.v1.users import router as users_router
from app.api.v1.workspace import router as workspace_router
from app.api.v1.tickets import router as tickets_router
from app.api.v1.settings import router as settings_router
from app.api.v1.sync_log import router as sync_log_router
from app.core.database import Base, engine
from sqlalchemy import inspect, text

# Create tables
Base.metadata.create_all(bind=engine)

# Lightweight in-place migration: this project has no Alembic, so add columns that were
# introduced after a database already existed. Safe to run every startup — it only acts
# when the column is actually missing.
_existing_user_columns = {c["name"] for c in inspect(engine).get_columns("users")}
if "channel_scope" not in _existing_user_columns:
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE users ADD COLUMN channel_scope VARCHAR(32) DEFAULT 'all'"))

app = FastAPI(title="M&M Invoice-to-Payment Tracker")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
 
app.include_router(invoice_router, prefix="/api/v1")
app.include_router(auth_router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(users_router, prefix="/api/v1/users", tags=["users"])
app.include_router(workspace_router, prefix="/api/v1")
app.include_router(tickets_router, prefix="/api/v1")
app.include_router(settings_router, prefix="/api/v1")
app.include_router(sync_log_router, prefix="/api/v1")

@app.get("/health")
def health_check():
    return {"status": "ok"}
