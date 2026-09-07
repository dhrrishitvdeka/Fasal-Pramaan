-- ============================================================================
-- READ-ONLY inventory. Paste into the Supabase SQL editor. Does not write.
-- ============================================================================

-- 1. App tables, RLS, estimated size
SELECT
  n.nspname AS schema,
  c.relname AS table_name,
  c.relrowsecurity AS rls,
  c.relforcerowsecurity AS rls_forced,
  pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
  (SELECT reltuples::bigint FROM pg_class x WHERE x.oid = c.oid) AS est_rows
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relname;

-- 2. Columns on web_* tables
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name LIKE 'web_%'
ORDER BY table_name, ordinal_position;

-- 3. Indexes
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename LIKE 'web_%'
ORDER BY tablename, indexname;

-- 4. Policies (expect ZERO on web_* after lockdown)
SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE tablename LIKE 'web_%' OR (schemaname = 'storage' AND tablename = 'objects')
ORDER BY schemaname, tablename, policyname;

-- 5. Grants to browser roles (expect ZERO on web_*)
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name LIKE 'web_%'
  AND grantee IN ('anon', 'authenticated', 'public')
ORDER BY table_name, grantee, privilege_type;

-- 6. Extensions (PostGIS is enabled but the app stores lat/lon doubles only)
SELECT extname, extversion FROM pg_extension ORDER BY extname;

-- 7. Storage buckets and object counts
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
ORDER BY id;

SELECT bucket_id, count(*) AS objects, pg_size_pretty(coalesce(sum(length(name)), 0)) AS name_bytes
FROM storage.objects
GROUP BY bucket_id
ORDER BY bucket_id;

SELECT bucket_id, name, metadata
FROM storage.objects
ORDER BY created_at DESC NULLS LAST
LIMIT 50;

-- 8. Row counts the app actually uses
SELECT 'web_plots' AS t, count(*) FROM public.web_plots
UNION ALL SELECT 'web_claims', count(*) FROM public.web_claims
UNION ALL SELECT 'web_claim_images', count(*) FROM public.web_claim_images
UNION ALL SELECT 'web_milestones', count(*) FROM public.web_milestones
UNION ALL SELECT 'web_review_actions', count(*) FROM public.web_review_actions
UNION ALL SELECT 'web_profiles', count(*) FROM public.web_profiles;
