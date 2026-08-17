-- Close browser/anon access to hosted web tables and evidence.
-- Service-role server routes bypass RLS. Re-runnable.

ALTER TABLE public.web_plots ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE public.web_milestones ADD COLUMN IF NOT EXISTS created_by text;

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

DROP POLICY IF EXISTS web_evidence_insert ON storage.objects;
DROP POLICY IF EXISTS web_evidence_select ON storage.objects;
DROP POLICY IF EXISTS web_evidence_update ON storage.objects;
DROP POLICY IF EXISTS web_evidence_delete ON storage.objects;
