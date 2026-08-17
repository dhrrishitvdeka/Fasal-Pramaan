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
3. This automatically enables `postgis`, `uuid-ossp`, and creates the `fasalpramaan-evidence` photo bucket.

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
# Database (Supabase PostgreSQL + PostGIS)
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
2. Set Environment Variables in Vercel:
   - `NEXT_PUBLIC_API_BASE_URL`: `https://your-api-url.onrender.com` (or your backend host)
   - `NEXT_PUBLIC_APP_NAME`: `FasalPramaan AI`
3. If the backend is not yet hosted, the frontend automatically activates **Interactive Showcase Demo Mode** with pre-seeded claims so you can present the full end-to-end user experience on Vercel immediately!
