-- ============================================================================
-- LIVE FIX: deny-by-default RLS + revoke browser grants on web_* tables.
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- Confirmed 2026-09-07: anon key could SELECT/INSERT/UPDATE/DELETE web_profiles
-- (including inserting role=administrator). Other web_* tables returned empty
-- to anon (RLS or empty), but web_profiles was fully open.
-- ============================================================================

DO $$
DECLARE
  t text;
  r record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'web_plots',
    'web_claims',
    'web_claim_images',
    'web_milestones',
    'web_review_actions',
    'web_profiles'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    FOR r IN
      SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
    END LOOP;
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
  END LOOP;
END $$;

-- Storage: private bucket, service_role only.
UPDATE storage.buckets
SET public = false
WHERE id = 'fasal-web-evidence';

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "Service Role Upload Access"
ON storage.objects FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'fasal-web-evidence');
