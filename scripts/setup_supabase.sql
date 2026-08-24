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
    'fasal-web-evidence',
    'fasal-web-evidence',
    false,
    15728640, -- 15 MB
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 15728640,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- 4. Storage Security Policies — service_role upload only.
-- All app uploads go through server routes using the service-role client
-- (src/lib/supabase.ts); browsers never write to the bucket directly.
-- Deny-by-default posture matches scripts/lock_web_rls.sql.
DROP POLICY IF EXISTS "Public Read Access for Evidence" ON storage.objects;
DROP POLICY IF EXISTS "Service Role Upload Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated User Upload Access" ON storage.objects;

CREATE POLICY "Service Role Upload Access"
ON storage.objects FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'fasal-web-evidence');

-- ============================================================================
-- Completed! Next step: Run scripts/setup_web_schema.sql in Supabase SQL editor.
-- ============================================================================
