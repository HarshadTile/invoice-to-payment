-- Invoice-to-Payment Tracker — MySQL setup
--
-- Run this once, then start the backend as usual: it creates every table
-- itself on startup (SQLAlchemy's Base.metadata.create_all in app/main.py),
-- so there's no schema to hand-maintain here. After the tables exist, create
-- your first login account with `python seed_admin.py` (see ../README.md).
--
-- Usage (from the backend folder):
--   mysql -u root -p < sql/create_database.sql
--
-- Invoice data itself is NOT stored here — it's read from
-- data/gcp_invoice_data.xlsx on every request.

CREATE DATABASE IF NOT EXISTS mahindra_i2p
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- ── Optional: a dedicated app user instead of using root ───────────────────
-- Uncomment and pick your own password, then put the matching connection
-- string in backend/.env:
--   DATABASE_URL=mysql+pymysql://i2p_app:YOUR_PASSWORD@localhost:3306/mahindra_i2p
--
-- CREATE USER IF NOT EXISTS 'i2p_app'@'localhost' IDENTIFIED BY 'YOUR_PASSWORD';
-- GRANT ALL PRIVILEGES ON mahindra_i2p.* TO 'i2p_app'@'localhost';
-- FLUSH PRIVILEGES;
