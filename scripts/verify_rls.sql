-- ============================================================================
-- Fasal-Pramaan: live RLS / grant probe (read-only)
-- Run in the Supabase SQL editor. Do not apply as a migration.
-- ============================================================================
-- Expected:
--   1. Every web_* table has relrowsecurity = true.
--   2. ZERO policies on web_* for anon or authenticated (deny-by-default).
--   3. ZERO table grants on web_* to anon / authenticated / public.
--   4. Storage bucket fasal-web-evidence is private.
-- ============================================================================

SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'web_plots', 'web_claims', 'web_claim_images',
    'web_milestones', 'web_review_actions', 'web_profiles'
  )
ORDER BY c.relname;

SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE tablename IN (
  'web_plots', 'web_claims', 'web_claim_images',
  'web_milestones', 'web_review_actions', 'web_profiles'
)
ORDER BY tablename, policyname;

SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name LIKE 'web_%'
  AND grantee IN ('anon', 'authenticated', 'public')
ORDER BY table_name, grantee, privilege_type;

SELECT id, public, file_size_limit
FROM storage.buckets
WHERE id = 'fasal-web-evidence';

SELECT policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY policyname;
