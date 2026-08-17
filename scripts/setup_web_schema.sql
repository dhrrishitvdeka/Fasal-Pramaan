-- Web farmer/reviewer tables for the Vercel dashboard path.
-- Run in the Supabase SQL editor after scripts/setup_supabase.sql.
-- Uses placeholders only — no credentials.

CREATE TABLE IF NOT EXISTS public.web_plots (
  id text PRIMARY KEY,
  name text NOT NULL,
  name_hi text,
  khasra_number text,
  area_hectares double precision DEFAULT 0,
  crop_type text,
  crop_type_hi text,
  crop_variety text,
  current_stage text,
  current_stage_hi text,
  sowing_date date,
  soil_type text,
  soil_type_hi text,
  irrigation_type text,
  irrigation_type_hi text,
  lat double precision,
  lon double precision,
  village text,
  district text,
  state text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.web_claims (
  id text PRIMARY KEY,
  plot_id text REFERENCES public.web_plots(id) ON DELETE SET NULL,
  plot_name text,
  plot_name_hi text,
  khasra_number text,
  crop_type text,
  crop_type_hi text,
  crop_variety text,
  status text NOT NULL DEFAULT 'under_review',
  farmer_observations text,
  missing_angles text[] DEFAULT '{}',
  recapture_reason text,
  recapture_reason_hi text,
  reviewer_notes text,
  quality_score double precision,
  coverage_score double precision,
  context_score double precision,
  integrity_score double precision,
  overall_confidence double precision,
  quality_notes text,
  coverage_notes text,
  context_notes text,
  integrity_notes text,
  crop_identified text,
  crop_confidence double precision,
  disease_detected text,
  disease_detected_hi text,
  severity_percentage double precision,
  severity_grade text,
  affected_area_hectares double precision,
  estimated_loss_inr double precision,
  model_confidence double precision,
  model_id text,
  hf_label text,
  hf_score double precision,
  payout_status text,
  payout_amount_inr double precision,
  capture_lat double precision,
  capture_lon double precision,
  capture_accuracy_m double precision,
  gps_status text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.web_claim_images (
  id text PRIMARY KEY,
  claim_id text NOT NULL REFERENCES public.web_claims(id) ON DELETE CASCADE,
  angle_type text NOT NULL,
  image_url text,
  storage_path text,
  captured_at timestamptz,
  lat double precision,
  lon double precision,
  accuracy_m double precision,
  sha256 text,
  quality_passed boolean,
  blur_score double precision,
  lighting_score double precision
);

CREATE TABLE IF NOT EXISTS public.web_milestones (
  id text PRIMARY KEY,
  plot_id text REFERENCES public.web_plots(id) ON DELETE CASCADE,
  crop_name text,
  crop_name_hi text,
  stage_name text,
  stage_name_hi text,
  day_number integer,
  due_date date,
  completed boolean DEFAULT false,
  completed_date date,
  evidence_image_url text,
  notes text,
  is_overdue boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.web_review_actions (
  id text PRIMARY KEY,
  claim_id text NOT NULL REFERENCES public.web_claims(id) ON DELETE CASCADE,
  action text NOT NULL,
  notes text,
  reason text,
  required_angles text[] DEFAULT '{}',
  actor text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.web_profiles (
  id text PRIMARY KEY,
  role text,
  full_name text,
  full_name_hi text,
  email text,
  phone text,
  village text,
  district text,
  state text,
  kisan_id text
);

ALTER TABLE public.web_plots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_claim_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_review_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS web_plots_anon_all ON public.web_plots;
DROP POLICY IF EXISTS web_claims_anon_all ON public.web_claims;
DROP POLICY IF EXISTS web_claim_images_anon_all ON public.web_claim_images;
DROP POLICY IF EXISTS web_milestones_anon_all ON public.web_milestones;
DROP POLICY IF EXISTS web_review_actions_anon_all ON public.web_review_actions;
DROP POLICY IF EXISTS web_profiles_anon_all ON public.web_profiles;

CREATE POLICY web_plots_anon_all ON public.web_plots FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY web_claims_anon_all ON public.web_claims FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY web_claim_images_anon_all ON public.web_claim_images FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY web_milestones_anon_all ON public.web_milestones FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY web_review_actions_anon_all ON public.web_review_actions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY web_profiles_anon_all ON public.web_profiles FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

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

DROP POLICY IF EXISTS web_evidence_insert ON storage.objects;
DROP POLICY IF EXISTS web_evidence_select ON storage.objects;
DROP POLICY IF EXISTS web_evidence_update ON storage.objects;

CREATE POLICY web_evidence_insert ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'fasal-web-evidence');

CREATE POLICY web_evidence_select ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'fasal-web-evidence');

CREATE POLICY web_evidence_update ON storage.objects
  FOR UPDATE TO anon, authenticated
  USING (bucket_id = 'fasal-web-evidence')
  WITH CHECK (bucket_id = 'fasal-web-evidence');
