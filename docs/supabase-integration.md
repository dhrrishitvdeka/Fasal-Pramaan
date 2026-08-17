# Supabase Backend & Database Integration Guide

This guide walks through configuring **Supabase** as the 100% free, managed cloud backend for **Fasal-Pramaan** (replacing local PostgreSQL, PostGIS, and MinIO).

---

## 1. Why Supabase?
* **Free Managed PostgreSQL 16**: Includes **PostGIS** for spatial plot boundary matching and GPS proximity checks ($\le 200\text{m}$).
* **S3-Compatible Object Storage**: 100% S3 compatible for storing tamper-evident crop photos.
* **Instant Cloud Connectivity**: Allows your Vercel Next.js web application and FastAPI backend to connect without running local Docker containers.

---

## 2. One-Time 3-Step Setup

### Step 1: Create a Free Project on Supabase
1. Go to [supabase.com](https://supabase.com) and create a free project.
2. Under **Project Settings $\rightarrow$ Database**, copy your **Connection String (URI / Pooler)**:
   ```text
   postgresql+psycopg://postgres.[project-ref]:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres?sslmode=require
   ```

### Step 2: Enable PostGIS & Storage (1-Click SQL)
1. In the Supabase Dashboard, click on **SQL Editor**.
2. Copy and paste the contents of [`scripts/setup_supabase.sql`](file:///C:/Users/dhrri/Desktop/Fasal-Pramaan-main/scripts/setup_supabase.sql) and click **Run**.
3. This automatically enables `postgis`, `uuid-ossp`, and `pgcrypto`, and creates the **private** `fasalpramaan-evidence` photo bucket (authenticated / service_role upload only; no public read).
4. Then run [`scripts/setup_web_schema.sql`](../scripts/setup_web_schema.sql) to create the Vercel farmer/reviewer tables (`web_claims`, `web_claim_images`, …) and the private `fasal-web-evidence` bucket.

### Step 3: Run Database Migrations
From your local terminal or CI/CD:
```bash
# Point DATABASE_URL to Supabase and run Alembic
export DATABASE_URL="postgresql+psycopg://postgres.[project-ref]:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres?sslmode=require"

cd services/api
alembic upgrade head
python -m app.db.seed
```

---

## 3. Environment Variables for Supabase

In your `.env` or Vercel / Cloud Run environment settings:

```env
# Browser / dashboard (never commit real values)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_HF_MODEL_ID=
HF_TOKEN=
SUPABASE_SERVICE_ROLE_KEY=

# Server-side connection test (scripts/test_supabase_conn.py)
SUPABASE_DB_PASSWORD=
SUPABASE_PROJECT_REF=
SUPABASE_DB_REGION=

# Database (Supabase PostgreSQL + PostGIS)
# Construct DATABASE_URL from SUPABASE_PROJECT_REF, SUPABASE_DB_PASSWORD, and SUPABASE_DB_REGION.
DATABASE_URL=postgresql+psycopg://postgres.[project-ref]:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres?sslmode=require

# Storage (Supabase S3 Compatibility)
MINIO_ENDPOINT=[project-ref].supabase.co/storage/v1/s3
MINIO_ACCESS_KEY=[project-ref]
MINIO_SECRET_KEY=[your-supabase-service-role-or-s3-key]
MINIO_BUCKET=fasalpramaan-evidence
MINIO_USE_SSL=true
STORAGE_BACKEND=s3
```

---

## 4. Deploying Web App on Vercel with Supabase Backend

1. **Deploy Frontend on Vercel**: Connect `apps/dashboard` to Vercel.
2. Set Environment Variables in Vercel (values from your host dashboard — never commit them):
   - `NEXT_PUBLIC_API_BASE_URL`: `https://your-api-url.onrender.com` (or your backend host)
   - `NEXT_PUBLIC_APP_NAME`: `FasalPramaan AI`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `NEXT_PUBLIC_HF_MODEL_ID` (`wambugu71/crop_leaf_diseases_vit`)
   - `HF_TOKEN` (server-only Hugging Face token)
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only)
3. There is no showcase/pseudo fallback. Farmer capture posts to `/api/claims`, which stores photos in the private `fasal-web-evidence` bucket, calls the Hugging Face model, and writes `web_claims`. The reviewer queue reads the same rows.
