"""Apply scripts/lock_web_rls.sql using env-only credentials. Never prints secrets."""

from __future__ import annotations

import os
import sys
import urllib.parse
from pathlib import Path

import psycopg


def _load_env_files() -> None:
    root = Path(__file__).resolve().parents[1]
    for candidate in (root / ".env", root / "local" / ".env"):
        if not candidate.is_file():
            continue
        for raw in candidate.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            value = value.strip().strip('"').strip("'")
            os.environ.setdefault(key.strip(), value)


def main() -> int:
    _load_env_files()
    password = os.environ.get("SUPABASE_DB_PASSWORD", "")
    project_ref = os.environ.get("SUPABASE_PROJECT_REF", "")
    region = os.environ.get("SUPABASE_DB_REGION", "")
    if not password or not project_ref or not region:
        print("Missing SUPABASE_DB_PASSWORD / SUPABASE_PROJECT_REF / SUPABASE_DB_REGION", file=sys.stderr)
        return 1
    sql_path = Path(__file__).with_name("lock_web_rls.sql")
    sql = sql_path.read_text(encoding="utf-8")
    encoded = urllib.parse.quote_plus(password)
    uri = (
        f"postgresql://postgres.{project_ref}:{encoded}"
        f"@aws-0-{region}.pooler.supabase.com:6543/postgres?sslmode=require"
    )
    try:
        with psycopg.connect(uri, connect_timeout=10) as conn:
            with conn.cursor() as cur:
                cur.execute(sql)
            conn.commit()
        print("Applied lock_web_rls.sql: anon/authenticated table and storage policies dropped.")
        return 0
    except Exception as exc:  # noqa: BLE001
        message = str(exc).replace(password, "***").replace(encoded, "***")
        print(f"Failed: {type(exc).__name__}: {message}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
