-- ============================================================================
-- Live schema + storage cleanup / optimize. Safe to re-run.
-- Run AFTER reviewing scripts/audit_schema.sql.
--
-- What this does:
--   1. Force deny-by-default RLS and revoke browser grants (web_profiles was
--      fully open to the anon key on 2026-09-07).
--   2. Add the indexes the app actually queries (status, created_at, inference).
--   3. Add status/payout/inference CHECKs used by the Next.js routes.
--   4. Keep the private evidence bucket; delete leftover "test" prefixes.
--   5. ANALYZE hot tables.
--
-- What this does NOT do:
--   - Drop PostGIS / uuid-ossp / pgcrypto (harmless; not referenced by app SQL).
--   - Drop hf_label / hf_score (Gemini still writes those column names).
--   - Drop area_kattha (cheap; unused write path, still mapped on read).
-- ============================================================================

BEGIN;

-- 0. Bring an older live table up to the columns the app writes today.
--    The hosted project was created before inference_status / growth_stage /
--    gate_result existed; CREATE INDEX on a missing column aborts the script.
ALTER TABLE public.web_plots ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE public.web_plots ADD COLUMN IF NOT EXISTS name_hi text;
ALTER TABLE public.web_plots ADD COLUMN IF NOT EXISTS khata_number text;
ALTER TABLE public.web_plots ADD COLUMN IF NOT EXISTS hissa_number text;
ALTER TABLE public.web_plots ADD COLUMN IF NOT EXISTS tehsil text;
ALTER TABLE public.web_plots ADD COLUMN IF NOT EXISTS ownership_type text;
ALTER TABLE public.web_plots ADD COLUMN IF NOT EXISTS season text;
ALTER TABLE public.web_plots ADD COLUMN IF NOT EXISTS area_kattha double precision;
ALTER TABLE public.web_plots ADD COLUMN IF NOT EXISTS crop_type_hi text;
ALTER TABLE public.web_plots ADD COLUMN IF NOT EXISTS current_stage_hi text;
ALTER TABLE public.web_plots ADD COLUMN IF NOT EXISTS soil_type_hi text;
ALTER TABLE public.web_plots ADD COLUMN IF NOT EXISTS irrigation_type_hi text;

ALTER TABLE public.web_milestones ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE public.web_milestones ADD COLUMN IF NOT EXISTS crop_name_hi text;
ALTER TABLE public.web_milestones ADD COLUMN IF NOT EXISTS stage_name_hi text;
ALTER TABLE public.web_milestones ADD COLUMN IF NOT EXISTS evidence_image_url text;
ALTER TABLE public.web_milestones ADD COLUMN IF NOT EXISTS is_overdue boolean DEFAULT false;

ALTER TABLE public.web_claims ADD COLUMN IF NOT EXISTS plot_name_hi text;
ALTER TABLE public.web_claims ADD COLUMN IF NOT EXISTS crop_type_hi text;
ALTER TABLE public.web_claims ADD COLUMN IF NOT EXISTS recapture_reason_hi text;
ALTER TABLE public.web_claims ADD COLUMN IF NOT EXISTS disease_detected_hi text;
ALTER TABLE public.web_claims ADD COLUMN IF NOT EXISTS sowing_date date;
ALTER TABLE public.web_claims ADD COLUMN IF NOT EXISTS peril text DEFAULT 'normal';
ALTER TABLE public.web_claims ADD COLUMN IF NOT EXISTS intent_id text;
ALTER TABLE public.web_claims ADD COLUMN IF NOT EXISTS gate_result jsonb;
ALTER TABLE public.web_claims ADD COLUMN IF NOT EXISTS context_signals jsonb;
ALTER TABLE public.web_claims ADD COLUMN IF NOT EXISTS adaptive_result jsonb;
ALTER TABLE public.web_claims ADD COLUMN IF NOT EXISTS inference_status text;
ALTER TABLE public.web_claims ADD COLUMN IF NOT EXISTS inference_error text;
ALTER TABLE public.web_claims ADD COLUMN IF NOT EXISTS inference_started_at timestamptz;
ALTER TABLE public.web_claims ADD COLUMN IF NOT EXISTS growth_stage text;
ALTER TABLE public.web_claims ADD COLUMN IF NOT EXISTS predicted_growth_stage text;
ALTER TABLE public.web_claims ADD COLUMN IF NOT EXISTS corrected_crop text;
ALTER TABLE public.web_claims ADD COLUMN IF NOT EXISTS corrected_grade text;
ALTER TABLE public.web_claims ADD COLUMN IF NOT EXISTS corrected_severity text;
ALTER TABLE public.web_claims ADD COLUMN IF NOT EXISTS corrected_damage_codes text[];
ALTER TABLE public.web_claims ADD COLUMN IF NOT EXISTS corrected_affected_area_pct double precision;
ALTER TABLE public.web_claims ADD COLUMN IF NOT EXISTS corrected_growth_stage text;
ALTER TABLE public.web_claims ADD COLUMN IF NOT EXISTS payout_status text;
ALTER TABLE public.web_claims ADD COLUMN IF NOT EXISTS payout_amount_inr double precision;
ALTER TABLE public.web_claims ADD COLUMN IF NOT EXISTS hf_label text;
ALTER TABLE public.web_claims ADD COLUMN IF NOT EXISTS hf_score double precision;
ALTER TABLE public.web_claims ADD COLUMN IF NOT EXISTS model_id text;
ALTER TABLE public.web_claims ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.web_claim_images ADD COLUMN IF NOT EXISTS gate_result jsonb;
ALTER TABLE public.web_claim_images ADD COLUMN IF NOT EXISTS sha256 text;
ALTER TABLE public.web_claim_images ADD COLUMN IF NOT EXISTS storage_path text;
ALTER TABLE public.web_claim_images ADD COLUMN IF NOT EXISTS blur_score double precision;
ALTER TABLE public.web_claim_images ADD COLUMN IF NOT EXISTS lighting_score double precision;
ALTER TABLE public.web_claim_images ADD COLUMN IF NOT EXISTS quality_passed boolean;

ALTER TABLE public.web_review_actions ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE public.web_review_actions ADD COLUMN IF NOT EXISTS required_angles text[] DEFAULT '{}';

ALTER TABLE public.web_profiles ADD COLUMN IF NOT EXISTS full_name_hi text;
ALTER TABLE public.web_profiles ADD COLUMN IF NOT EXISTS kisan_id text;
ALTER TABLE public.web_profiles ADD COLUMN IF NOT EXISTS village text;
ALTER TABLE public.web_profiles ADD COLUMN IF NOT EXISTS district text;
ALTER TABLE public.web_profiles ADD COLUMN IF NOT EXISTS state text;

-- 1. RLS lockdown -----------------------------------------------------------
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

-- 2. Query-shaped indexes ---------------------------------------------------
CREATE INDEX IF NOT EXISTS web_claims_status_created_idx
  ON public.web_claims (status, created_at DESC);
CREATE INDEX IF NOT EXISTS web_claims_inference_status_idx
  ON public.web_claims (inference_status)
  WHERE inference_status IS NOT NULL AND inference_status <> 'complete';
CREATE INDEX IF NOT EXISTS web_claims_payout_status_idx
  ON public.web_claims (payout_status)
  WHERE payout_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS web_claim_images_sha256_idx
  ON public.web_claim_images (sha256)
  WHERE sha256 IS NOT NULL;
CREATE INDEX IF NOT EXISTS web_review_actions_created_idx
  ON public.web_review_actions (created_at DESC);
CREATE INDEX IF NOT EXISTS web_milestones_due_idx
  ON public.web_milestones (due_date)
  WHERE completed IS NOT TRUE;

-- Existing hot-path indexes (idempotent)
CREATE INDEX IF NOT EXISTS web_claims_created_by_idx ON public.web_claims (created_by);
CREATE INDEX IF NOT EXISTS web_claims_plot_id_idx ON public.web_claims (plot_id);
CREATE INDEX IF NOT EXISTS web_plots_created_by_idx ON public.web_plots (created_by);
CREATE INDEX IF NOT EXISTS web_claim_images_claim_id_idx ON public.web_claim_images (claim_id);
CREATE INDEX IF NOT EXISTS web_milestones_plot_id_idx ON public.web_milestones (plot_id);
CREATE INDEX IF NOT EXISTS web_milestones_created_by_idx ON public.web_milestones (created_by);
CREATE INDEX IF NOT EXISTS web_review_actions_claim_id_idx ON public.web_review_actions (claim_id);
CREATE INDEX IF NOT EXISTS web_profiles_email_idx ON public.web_profiles (email);

-- 3. Domain CHECKs (only when every existing row already complies) ---------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.web_claims
    WHERE status NOT IN (
      'under_review', 'submitted', 'needs_recapture', 'verified',
      'rejected', 'physical_inspection', 'draft'
    )
  ) THEN
    RAISE NOTICE 'Skipped web_claims_status_chk: existing rows use other statuses';
  ELSE
    ALTER TABLE public.web_claims DROP CONSTRAINT IF EXISTS web_claims_status_chk;
    ALTER TABLE public.web_claims ADD CONSTRAINT web_claims_status_chk
      CHECK (status IN (
        'under_review', 'submitted', 'needs_recapture', 'verified',
        'rejected', 'physical_inspection', 'draft'
      ));
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.web_claims
    WHERE payout_status IS NOT NULL AND payout_status NOT IN (
      'pending_review', 'approved', 'rejected', 'needs_action', 'processing'
    )
  ) THEN
    RAISE NOTICE 'Skipped web_claims_payout_chk';
  ELSE
    ALTER TABLE public.web_claims DROP CONSTRAINT IF EXISTS web_claims_payout_chk;
    ALTER TABLE public.web_claims ADD CONSTRAINT web_claims_payout_chk
      CHECK (
        payout_status IS NULL OR payout_status IN (
          'pending_review', 'approved', 'rejected', 'needs_action', 'processing'
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.web_claims
    WHERE inference_status IS NOT NULL
      AND inference_status NOT IN ('pending', 'complete', 'failed')
  ) THEN
    RAISE NOTICE 'Skipped web_claims_inference_chk';
  ELSE
    ALTER TABLE public.web_claims DROP CONSTRAINT IF EXISTS web_claims_inference_chk;
    ALTER TABLE public.web_claims ADD CONSTRAINT web_claims_inference_chk
      CHECK (
        inference_status IS NULL OR inference_status IN ('pending', 'complete', 'failed')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.web_profiles
    WHERE role IS NOT NULL AND role NOT IN ('farmer', 'reviewer', 'administrator')
  ) THEN
    RAISE NOTICE 'Skipped web_profiles_role_chk';
  ELSE
    ALTER TABLE public.web_profiles DROP CONSTRAINT IF EXISTS web_profiles_role_chk;
    ALTER TABLE public.web_profiles ADD CONSTRAINT web_profiles_role_chk
      CHECK (role IS NULL OR role IN ('farmer', 'reviewer', 'administrator'));
  END IF;
END $$;

-- 4. updated_at trigger (claims only — the only table the app updates in a loop)
CREATE OR REPLACE FUNCTION public.web_bump_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS web_claims_bump_updated_at ON public.web_claims;
CREATE TRIGGER web_claims_bump_updated_at
  BEFORE UPDATE ON public.web_claims
  FOR EACH ROW EXECUTE FUNCTION public.web_bump_updated_at();

-- 5. Storage: private evidence bucket, service_role only, drop junk prefixes
UPDATE storage.buckets
SET
  public = false,
  file_size_limit = 15728640,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'fasal-web-evidence';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'fasal-web-evidence',
  'fasal-web-evidence',
  false,
  15728640,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 15728640,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

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

CREATE POLICY "Service Role Select Access"
ON storage.objects FOR SELECT
TO service_role
USING (bucket_id = 'fasal-web-evidence');

-- Leftover explorer placeholder from empty-bucket listing ("test")
DELETE FROM storage.objects
WHERE bucket_id = 'fasal-web-evidence'
  AND (name = 'test' OR name LIKE 'test/%');

-- 6. Comments so the SQL editor catalog is self-explanatory
COMMENT ON TABLE public.web_plots IS 'Farmer land parcels. Written by /api/farmer/plots and Saathi register_plot.';
COMMENT ON TABLE public.web_claims IS 'Insurance claims. Written by /api/claims; reviewed via /api/claims/[id]/action.';
COMMENT ON TABLE public.web_claim_images IS 'Evidence stills in bucket fasal-web-evidence. Paths are server-generated.';
COMMENT ON TABLE public.web_milestones IS 'Growth-stage reminders per plot.';
COMMENT ON TABLE public.web_review_actions IS 'Immutable reviewer decision trail. Admin-only on the stats dump.';
COMMENT ON TABLE public.web_profiles IS 'App-layer role cache. Role is resolved from JWT + REVIEWER_EMAILS; never trust client writes.';

ANALYZE public.web_plots;
ANALYZE public.web_claims;
ANALYZE public.web_claim_images;
ANALYZE public.web_milestones;
ANALYZE public.web_review_actions;
ANALYZE public.web_profiles;

COMMIT;
