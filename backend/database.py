"""
Sentrix — Database Layer (PostgreSQL + SQLite fallback)
Uses PostgreSQL (via psycopg2) when DATABASE_URL is set (production on Render),
falls back to SQLite for local development.

Tables:
  - tourists: all registered tourists (mirrors the Tourist Pydantic model)
  - alerts:   all SOS alerts (stored as JSON blobs for flexibility)
"""

import json
import os
from pathlib import Path
from typing import Optional

from models import Tourist

DATABASE_URL = os.getenv("DATABASE_URL")

# ---------------------------------------------------------------------------
# Connection abstraction — PostgreSQL or SQLite
# ---------------------------------------------------------------------------

_conn = None


def _get_conn():
    """Get or create a database connection (PostgreSQL or SQLite)."""
    global _conn
    if _conn is not None:
        return _conn

    if DATABASE_URL:
        import psycopg2
        import psycopg2.extras
        _conn = psycopg2.connect(DATABASE_URL, sslmode="require")
        _conn.autocommit = False
        print(f"[DB] Connected to PostgreSQL (Neon).")
    else:
        import sqlite3
        DB_PATH = Path(__file__).parent / "sentrix.db"
        _conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
        _conn.execute("PRAGMA journal_mode=WAL")
        _conn.execute("PRAGMA foreign_keys=ON")
        _conn.row_factory = sqlite3.Row
        print("[DB] Connected to local SQLite.")

    return _conn


def _is_postgres() -> bool:
    return DATABASE_URL is not None


def _placeholder() -> str:
    """Return the correct placeholder for the current DB engine."""
    return "%s" if _is_postgres() else "?"


def _execute(sql: str, params: tuple = ()):
    """Execute a SQL statement with the correct placeholder style."""
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute(sql, params)
    return cur


def _commit():
    _get_conn().commit()


def _fetchall(sql: str, params: tuple = ()):
    """Execute and fetch all results as list of dicts."""
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute(sql, params)
    columns = [desc[0] for desc in cur.description] if cur.description else []
    rows = cur.fetchall()
    if _is_postgres():
        return [dict(zip(columns, row)) for row in rows]
    else:
        return [dict(row) for row in rows]


def _fetchone(sql: str, params: tuple = ()):
    """Execute and fetch one result as dict."""
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute(sql, params)
    row = cur.fetchone()
    if row is None:
        return None
    if _is_postgres():
        columns = [desc[0] for desc in cur.description]
        return dict(zip(columns, row))
    else:
        return dict(row)


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------
def init_db():
    """Create tables if they don't exist."""
    p = _placeholder()
    conn = _get_conn()
    cur = conn.cursor()

    if _is_postgres():
        cur.execute("""
            CREATE TABLE IF NOT EXISTS tourists (
                tourist_id   TEXT PRIMARY KEY,
                data         TEXT NOT NULL,
                created_at   TIMESTAMP DEFAULT NOW()
            );
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS alerts (
                alert_id     TEXT PRIMARY KEY,
                tourist_id   TEXT,
                data         TEXT NOT NULL,
                created_at   TIMESTAMP DEFAULT NOW()
            );
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_alerts_tourist ON alerts(tourist_id);
        """)
    else:
        cur.executescript("""
            CREATE TABLE IF NOT EXISTS tourists (
                tourist_id   TEXT PRIMARY KEY,
                data         TEXT NOT NULL,
                created_at   TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS alerts (
                alert_id     TEXT PRIMARY KEY,
                tourist_id   TEXT,
                data         TEXT NOT NULL,
                created_at   TEXT DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_alerts_tourist ON alerts(tourist_id);
        """)

    _commit()
    db_type = "PostgreSQL" if _is_postgres() else "SQLite"
    print(f"[DB] {db_type} tables initialized.")


# ---------------------------------------------------------------------------
# JSON → DB Migration (local SQLite only)
# ---------------------------------------------------------------------------
JSON_DB_PATH = Path(__file__).parent / "data_registry.json"


def migrate_from_json():
    """One-time migration from old data_registry.json (local dev only)."""
    if _is_postgres():
        return  # No JSON migration needed for cloud DB
    if not JSON_DB_PATH.exists():
        return

    p = _placeholder()
    row = _fetchone("SELECT COUNT(*) as cnt FROM tourists")
    if row and row["cnt"] > 0:
        return

    try:
        with open(JSON_DB_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)

        tourist_count = 0
        alert_count = 0

        if "tourists" in data:
            for tid, tdata in data["tourists"].items():
                _execute(
                    f"INSERT INTO tourists (tourist_id, data) VALUES ({p}, {p}) ON CONFLICT DO NOTHING",
                    (tid, json.dumps(tdata)),
                )
                tourist_count += 1

        if "alerts" in data:
            for aid, adata in data["alerts"].items():
                _execute(
                    f"INSERT INTO alerts (alert_id, tourist_id, data) VALUES ({p}, {p}, {p}) ON CONFLICT DO NOTHING",
                    (aid, adata.get("tourist_id", ""), json.dumps(adata)),
                )
                alert_count += 1

        _commit()

        # Rename old JSON file as backup
        backup = JSON_DB_PATH.with_suffix(".json.bak")
        os.rename(str(JSON_DB_PATH), str(backup))

        print(f"[DB] Migrated from JSON: {tourist_count} tourists, {alert_count} alerts.")
        print(f"[DB] Old JSON backed up to {backup.name}")

    except Exception as e:
        print(f"[DB] Migration error: {e}")


# ---------------------------------------------------------------------------
# Tourist CRUD
# ---------------------------------------------------------------------------
def save_tourist(tourist: Tourist):
    """Insert or update a tourist record."""
    p = _placeholder()
    if _is_postgres():
        _execute(
            f"INSERT INTO tourists (tourist_id, data) VALUES ({p}, {p}) "
            f"ON CONFLICT (tourist_id) DO UPDATE SET data = EXCLUDED.data",
            (tourist.tourist_id, json.dumps(tourist.model_dump())),
        )
    else:
        _execute(
            f"INSERT OR REPLACE INTO tourists (tourist_id, data) VALUES ({p}, {p})",
            (tourist.tourist_id, json.dumps(tourist.model_dump())),
        )
    _commit()


def load_all_tourists() -> dict[str, Tourist]:
    """Load all tourists into a dict keyed by tourist_id."""
    rows = _fetchall("SELECT tourist_id, data FROM tourists")
    result = {}
    for row in rows:
        try:
            result[row["tourist_id"]] = Tourist(**json.loads(row["data"]))
        except Exception as e:
            print(f"[DB] Error loading tourist {row['tourist_id']}: {e}")
    return result


def get_tourist(tourist_id: str) -> Optional[Tourist]:
    """Get a single tourist by ID."""
    p = _placeholder()
    row = _fetchone(f"SELECT data FROM tourists WHERE tourist_id = {p}", (tourist_id,))
    if row:
        return Tourist(**json.loads(row["data"]))
    return None


def update_tourist_status(tourist_id: str, status: str):
    """Update just the status field of a tourist."""
    p = _placeholder()
    row = _fetchone(f"SELECT data FROM tourists WHERE tourist_id = {p}", (tourist_id,))
    if row:
        data = json.loads(row["data"])
        data["status"] = status
        _execute(
            f"UPDATE tourists SET data = {p} WHERE tourist_id = {p}",
            (json.dumps(data), tourist_id),
        )
        _commit()


# ---------------------------------------------------------------------------
# Alert CRUD
# ---------------------------------------------------------------------------
def save_alert(alert_id: str, alert_data: dict):
    """Insert or update an alert record."""
    p = _placeholder()
    if _is_postgres():
        _execute(
            f"INSERT INTO alerts (alert_id, tourist_id, data) VALUES ({p}, {p}, {p}) "
            f"ON CONFLICT (alert_id) DO UPDATE SET data = EXCLUDED.data",
            (alert_id, alert_data.get("tourist_id", ""), json.dumps(alert_data)),
        )
    else:
        _execute(
            f"INSERT OR REPLACE INTO alerts (alert_id, tourist_id, data) VALUES ({p}, {p}, {p})",
            (alert_id, alert_data.get("tourist_id", ""), json.dumps(alert_data)),
        )
    _commit()


def load_all_alerts() -> dict[str, dict]:
    """Load all alerts into a dict keyed by alert_id."""
    rows = _fetchall("SELECT alert_id, data FROM alerts")
    result = {}
    for row in rows:
        try:
            result[row["alert_id"]] = json.loads(row["data"])
        except Exception as e:
            print(f"[DB] Error loading alert {row['alert_id']}: {e}")
    return result


def get_alerts_for_tourist(tourist_id: str) -> list[dict]:
    """Get all alerts for a specific tourist."""
    p = _placeholder()
    rows = _fetchall(
        f"SELECT data FROM alerts WHERE tourist_id = {p} ORDER BY created_at DESC",
        (tourist_id,),
    )
    return [json.loads(row["data"]) for row in rows]


def update_alert(alert_id: str, alert_data: dict):
    """Update an existing alert."""
    save_alert(alert_id, alert_data)


def clear_all_alerts():
    """Delete all alerts (demo reset)."""
    _execute("DELETE FROM alerts")
    _commit()


def get_tourist_count() -> int:
    """Get total number of registered tourists."""
    row = _fetchone("SELECT COUNT(*) as cnt FROM tourists")
    return row["cnt"] if row else 0


def get_alert_count() -> int:
    """Get total number of alerts."""
    row = _fetchone("SELECT COUNT(*) as cnt FROM alerts")
    return row["cnt"] if row else 0


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------
def startup():
    """Initialize DB, run migration, return loaded data."""
    init_db()
    migrate_from_json()

    tourists = load_all_tourists()
    alerts = load_all_alerts()

    db_type = "PostgreSQL (Neon)" if _is_postgres() else "SQLite"
    print(f"[DB] Ready on {db_type}: {len(tourists)} tourists, {len(alerts)} alerts.")
    return tourists, alerts
