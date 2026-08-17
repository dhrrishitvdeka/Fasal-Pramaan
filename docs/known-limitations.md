# Operational Boundaries & Governance Specifications

Fasal-Pramaan is engineered with explicit operational boundaries to guarantee responsible, explainable, and human-supervised claim adjudication.

---

## 1. Scope of the Local Vision Transformer Model

The default `crop_health_v4` DINOv2 ViT-S/14 model provides **assisted optical leaf-health screening** across four primary crops: maize, paddy, potato, and wheat.

- **Screening vs. Settlement**: The model outputs structured screening buckets (`A` = Healthy, `B` = Borderline/Uncertain, `C` = Disease Pattern, `U` = Unusable/OOD). It is not designed to autonomously compute final insurance payout percentages or legal liabilities.
- **Multi-Peril Scope**: While the optical model excels at identifying foliar fungal and bacterial lesion patterns, landscape-scale perils (such as macro flooding, hailstorm devastation, regional drought, or lodging) are evaluated via the comprehensive 5-angle spatial capture protocol (`wide_field`, `left_context`, `mid_canopy`, `right_context`, `closeup_damage`) and adjudicated by human reviewers.
- **Potato Healthy Baseline**: As documented in the benchmark model card ([AI_MODEL_MVP.md](./AI_MODEL_MVP.md)), the potato healthy subset contains high natural visual variation (recall `0.25`, F1 `0.32`), and the engine conservatively routes borderline potato cases to human review via Grade `B`.

---

## 2. Evidence Trust Engine Boundaries

- **Separation of Concerns**: Model inference confidence ($P_{\text{model}}$) is strictly decoupled from Evidence Trust Confidence ($C_{\text{final}}$). High model certainty on an un-geotagged or blurry photo will not artificially inflate the evidence trust score.
- **Missing Signal Policy**: The system never converts missing signals (e.g., absent GPS or unverified checksums) into passed scores. Missing inputs result in explicit deductions and lower confidence bounds.
- **Anti-Fraud Enforcement**: Suspected duplicate files, perceptual collisions, or mock GPS signals trigger mandatory human investigation and cannot be cleared by automated recaptures.

---

## 3. Hosted web (Vercel) boundaries

- **Hosted model is assistive only**: the Fasal-Pramaan Space runs `dhrrishitvdeka/fasal-pramaan-model` (DINOv2 ViT-S/14 ONNX). It returns crop-conditioned A/B/C/U workflow buckets. It does not estimate disease identity, severity, affected area, or payout. Human review is required.
- **GPS is the device browser**: `navigator.geolocation`. There is no geocoding, plot-boundary, or weather API on this path. Missing GPS lowers the context score; it is not treated as a pass.
- **No Gemini / Fasal Saathi** on Vercel. Voice dictation on `/farmer/capture` uses the browser Web Speech API when present.
- **Reviewer login** needs a Supabase Auth user. Farmer routes are public; do not treat that as production access control.

For full architectural governance and risk mitigation protocols, see [AI Governance & Safety Boundaries](./governance-and-safety.md).
