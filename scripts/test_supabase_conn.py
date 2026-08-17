import urllib.parse
import psycopg

pwd = urllib.parse.quote_plus("N4@60@evS2%!z4BP&AKe")
ref = "ifaoittxcrmlpkadixxt"

regions = [
    "ap-south-1",      # Mumbai / India
    "ap-southeast-1",  # Singapore
    "us-east-1",       # N. Virginia
    "us-west-1",       # N. California
    "eu-central-1",    # Frankfurt
    "eu-west-1",       # Ireland
    "ap-northeast-1",  # Tokyo
]

found = False
for r in regions:
    pooler_host = f"aws-0-{r}.pooler.supabase.com"
    uri = f"postgresql://postgres.{ref}:{pwd}@{pooler_host}:6543/postgres?sslmode=require"
    print(f"Testing {r} ({pooler_host}:6543)...")
    try:
        with psycopg.connect(uri, connect_timeout=6) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT version();")
                print(f"SUCCESS! Connected to {r}: {cur.fetchone()[0]}")
                cur.execute("CREATE EXTENSION IF NOT EXISTS postgis;")
                cur.execute("CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";")
                cur.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
                conn.commit()
                print("Extensions successfully enabled!")
                found = True
                print(f"CONFIRMED_REGION={r}")
                break
    except Exception as e:
        print(f"  Failed on {r}: {e}")

if not found:
    print("Could not connect automatically across tested regions.")
