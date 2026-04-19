"""
Sentrix — SQLite Database Layer
Replaces the old JSON-file persistence with a proper SQLite database.
Uses Python's built-in sqlite3 — no extra pip installs needed.

Tables:
  - tourists: all registered tourists (mirrors the Tourist Pydantic model)
  - alerts:   all SOS alerts (stored as JSON blobs for flexibility)

On first startup, auto-migrates from data_registry.json if it exists.
"""

import sqlite3
import json
import os
from pathlib import Path
from typing import Optional

from models import Tourist

DB_PATH = Path(__file__).parent / "sentrix.db"
JSON_DB_PATH = Path(__file__).parent / "data_registry.json"


def get_connection() -> sqlite3.Connection:
    """Get a SQLite connection with WAL mode for concurrent reads."""
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.row_factory = sqlite3.Row
    return conn


# Global connection — reused across the app (single-threaded async is fine)
_conn: Optional[sqlite3.Connection] = None


def _get_conn() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        _conn = get_connection()
    return _conn


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------
def init_db():
    """Create tables if they don't exist."""
    conn = _get_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS tourists (
            tourist_id   TEXT PRIMARY KEY,
            data         TEXT NOT NULL,   -- JSON blob of Tourist model
            created_at   TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS alerts (
            alert_id     TEXT PRIMARY KEY,
            tourist_id   TEXT,
            data         TEXT NOT NULL,   -- JSON blob of Alert dict
            created_at   TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_alerts_tourist ON alerts(tourist_id);
    """)
    conn.commit()
    print("[DB] SQLite tables initialized.")


# ---------------------------------------------------------------------------
# JSON → SQLite Migration
# ---------------------------------------------------------------------------
def migrate_from_json():
    """One-time migration from old data_registry.json to SQLite."""
    if not JSON_DB_PATH.exists():
        return

    conn = _get_conn()

    # Check if DB already has data (migration already done)
    row = conn.execute("SELECT COUNT(*) FROM tourists").fetchone()
    if row[0] > 0:
        return

    try:
        with open(JSON_DB_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)

        tourist_count = 0
        alert_count = 0

        if "tourists" in data:
            for tid, tdata in data["tourists"].items():
                conn.execute(
                    "INSERT OR IGNORE INTO tourists (tourist_id, data) VALUES (?, ?)",
                    (tid, json.dumps(tdata)),
                )
                tourist_count += 1

        if "alerts" in data:
            for aid, adata in data["alerts"].items():
                conn.execute(
                    "INSERT OR IGNORE INTO alerts (alert_id, tourist_id, data) VALUES (?, ?, ?)",
                    (aid, adata.get("tourist_id", ""), json.dumps(adata)),
                )
                alert_count += 1

        conn.commit()

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
    conn = _get_conn()
    conn.execute(
        "INSERT OR REPLACE INTO tourists (tourist_id, data) VALUES (?, ?)",
        (tourist.tourist_id, json.dumps(tourist.model_dump())),
    )
    conn.commit()


def load_all_tourists() -> dict[str, Tourist]:
    """Load all tourists into a dict keyed by tourist_id."""
    conn = _get_conn()
    rows = conn.execute("SELECT tourist_id, data FROM tourists").fetchall()
    result = {}
    for row in rows:
        try:
            result[row["tourist_id"]] = Tourist(**json.loads(row["data"]))
        except Exception as e:
            print(f"[DB] Error loading tourist {row['tourist_id']}: {e}")
    return result


def get_tourist(tourist_id: str) -> Optional[Tourist]:
    """Get a single tourist by ID."""
    conn = _get_conn()
    row = conn.execute(
        "SELECT data FROM tourists WHERE tourist_id = ?", (tourist_id,)
    ).fetchone()
    if row:
        return Tourist(**json.loads(row["data"]))
    return None


def update_tourist_status(tourist_id: str, status: str):
    """Update just the status field of a tourist."""
    conn = _get_conn()
    row = conn.execute(
        "SELECT data FROM tourists WHERE tourist_id = ?", (tourist_id,)
    ).fetchone()
    if row:
        data = json.loads(row["data"])
        data["status"] = status
        conn.execute(
            "UPDATE tourists SET data = ? WHERE tourist_id = ?",
            (json.dumps(data), tourist_id),
        )
        conn.commit()


# ---------------------------------------------------------------------------
# Alert CRUD
# ---------------------------------------------------------------------------
def save_alert(alert_id: str, alert_data: dict):
    """Insert or update an alert record."""
    conn = _get_conn()
    conn.execute(
        "INSERT OR REPLACE INTO alerts (alert_id, tourist_id, data) VALUES (?, ?, ?)",
        (alert_id, alert_data.get("tourist_id", ""), json.dumps(alert_data)),
    )
    conn.commit()


def load_all_alerts() -> dict[str, dict]:
    """Load all alerts into a dict keyed by alert_id."""
    conn = _get_conn()
    rows = conn.execute("SELECT alert_id, data FROM alerts").fetchall()
    result = {}
    for row in rows:
        try:
            result[row["alert_id"]] = json.loads(row["data"])
        except Exception as e:
            print(f"[DB] Error loading alert {row['alert_id']}: {e}")
    return result


def get_alerts_for_tourist(tourist_id: str) -> list[dict]:
    """Get all alerts for a specific tourist."""
    conn = _get_conn()
    rows = conn.execute(
        "SELECT data FROM alerts WHERE tourist_id = ? ORDER BY created_at DESC",
        (tourist_id,),
    ).fetchall()
    return [json.loads(row["data"]) for row in rows]


def update_alert(alert_id: str, alert_data: dict):
    """Update an existing alert."""
    save_alert(alert_id, alert_data)


def clear_all_alerts():
    """Delete all alerts (demo reset)."""
    conn = _get_conn()
    conn.execute("DELETE FROM alerts")
    conn.commit()


def get_tourist_count() -> int:
    """Get total number of registered tourists."""
    conn = _get_conn()
    row = conn.execute("SELECT COUNT(*) FROM tourists").fetchone()
    return row[0]


def get_alert_count() -> int:
    """Get total number of alerts."""
    conn = _get_conn()
    row = conn.execute("SELECT COUNT(*) FROM alerts").fetchone()
    return row[0]


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------
def startup():
    """Initialize DB, run migration, return loaded data."""
    init_db()
    migrate_from_json()

    tourists = load_all_tourists()
    alerts = load_all_alerts()

    print(f"[DB] Ready: {len(tourists)} tourists, {len(alerts)} alerts in SQLite.")
    return tourists, alerts
