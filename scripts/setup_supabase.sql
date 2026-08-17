-- ============================================================================
-- Fasal-Pramaan: Supabase Production & Free Tier Database Bootstrap
-- Execute this script in your Supabase SQL Editor (1-Click Setup)
-- ============================================================================

-- 1. Enable Required Spatial and Cryptographic Extensions
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 2. Grant permissions to authenticated and service_role
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO postgres, anon, authenticated, service_role;

-- 3. Create a PRIVATE Storage Bucket for Evidence Photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'fasalpramaan-evidence',
    'fasalpramaan-evidence',
    false,
    15728640, -- 15 MB
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 15728640,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- 4. Storage Security Policies — authenticated / service_role upload only
DROP POLICY IF EXISTS "Public Read Access for Evidence" ON storage.objects;
DROP POLICY IF EXISTS "Service Role Upload Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated User Upload Access" ON storage.objects;

CREATE POLICY "Service Role Upload Access"
ON storage.objects FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'fasalpramaan-evidence');

CREATE POLICY "Authenticated User Upload Access"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'fasalpramaan-evidence');

-- ============================================================================
-- Completed! Next step: Run Alembic migrations against this database:
-- alembic upgrade head
-- ============================================================================
