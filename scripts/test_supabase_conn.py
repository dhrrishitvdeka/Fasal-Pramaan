"""Test a Supabase Postgres connection using environment variables only.

Required environment variables:
  SUPABASE_DB_PASSWORD
  SUPABASE_PROJECT_REF
  SUPABASE_DB_REGION

Never hardcode credentials in this file. This script never prints the password.
"""

from __future__ import annotations

import os
import sys
import urllib.parse

import psycopg

REQUIRED = ("SUPABASE_DB_PASSWORD", "SUPABASE_PROJECT_REF", "SUPABASE_DB_REGION")


def _redact(message: str, *secrets: str) -> str:
    redacted = message
    for secret in secrets:
        if secret:
            redacted = redacted.replace(secret, "***")
    return redacted


def main() -> int:
    missing = [name for name in REQUIRED if not os.environ.get(name)]
    if missing:
        print(
            "Missing required environment variables: " + ", ".join(missing),
            file=sys.stderr,
        )
        print(
            "Set SUPABASE_DB_PASSWORD, SUPABASE_PROJECT_REF, and "
            "SUPABASE_DB_REGION before running this script.",
            file=sys.stderr,
        )
        return 1

    password = os.environ["SUPABASE_DB_PASSWORD"]
    project_ref = os.environ["SUPABASE_PROJECT_REF"]
    region = os.environ["SUPABASE_DB_REGION"]
    encoded_password = urllib.parse.quote_plus(password)

    pooler_host = f"aws-0-{region}.pooler.supabase.com"
    uri = (
        f"postgresql://postgres.{project_ref}:{encoded_password}"
        f"@{pooler_host}:6543/postgres?sslmode=require"
    )

    print(f"Testing connection to region {region} ({pooler_host}:6543)...")
    try:
        with psycopg.connect(uri, connect_timeout=6) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT version();")
                version = cur.fetchone()[0]
                print(f"SUCCESS: connected. {version}")
                cur.execute("CREATE EXTENSION IF NOT EXISTS postgis;")
                cur.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";')
                cur.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
                conn.commit()
                print("Extensions successfully enabled!")
                print(f"CONFIRMED_REGION={region}")
        return 0
    except Exception as exc:
        safe = _redact(str(exc), password, encoded_password)
        print(f"Connection failed: {type(exc).__name__}: {safe}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
