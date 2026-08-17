# MUN Exhibition Walkthrough & Showcase Guide

This guide provides a structured, presentation-ready script and walkthrough for demonstrating **Fasal-Pramaan** at Model United Nations (MUN) exhibitions, agricultural tech conferences, and policy stakeholder reviews.

---

## Pre-Demonstration Setup

1. **Start the Platform**: Run `scripts/start-portable.ps1` (Windows) or `scripts/start-portable.sh` (Mac/Linux).
2. **Open Portals**:
   - **Farmer Portal**: `http://localhost:8085` (Login: `farmer@fasalpramaan.local` / `Demo@12345`)
   - **Reviewer Portal**: `http://localhost:3000` (Login: `reviewer@fasalpramaan.local` / `Demo@12345`)
3. **Reset Operational Data** (Optional clean slate):
   ```bash
   docker compose stop worker beat
   docker compose exec api python scripts/clear_operational_data.py --confirm-local-reset
   docker compose start worker beat
   ```

---

## Showcase Scenarios

### Scenario 1: High-Trust Verified Claim (The Ideal Assessment)

**Narrative**: A smallholder farmer captures complete, high-quality, geotagged evidence of blast disease on a paddy plot. The system verifies optical quality, spatial boundaries, and authenticity, assisting the reviewer with instant triage.

```mermaid
sequenceDiagram
  autonumber
  Farmer->>Mobile App: 1. Selects 'Paddy Kharif 2026' -> Guided Capture
  Farmer->>Mobile App: 2. Captures all 5 Canonical Angles
  Mobile App->>API: 3. Encrypted Upload & Finalize
  Worker->>Evidence Engine: 4. Evaluates: Q=94, C=100, X=85, I=100 -> Final = 92.6
  Worker->>AI Service: 5. DINOv2 ViT-S/14 -> Grade C (Paddy Blast)
  Reviewer->>Dashboard: 6. Inspects Review Queue (High Confidence 92.6/100)
  Reviewer->>Dashboard: 7. Clicks 'Accept & Verify' -> Status = VERIFIED
```

1. **Farmer Action**: In the Mobile App (`:8085`), open **Farms** $\rightarrow$ **Add Farm** (*"Green Valley"*), **Add Plot** (*"Plot A1"*), and start **Paddy Cycle**. Tap **Capture Crop Evidence**. Capture all 5 angles and tap **Save & Submit**.
2. **Reviewer Action**: In the Command Centre (`:3000`), open **Review Queue**. Click the case to show:
   - **Final Evidence Confidence**: `92.6 / 100` (Evidence Sufficient).
   - **Component Breakdown**: Quality `94.0`, Coverage `100.0`, Context `85.0`, Integrity `100.0`.
   - **DINOv2 AI Screening**: Grade `C` (*Disease Pattern Detected*).
   - **PostGIS GIS Overlay**: Plot polygon boundary matching the GPS capture pin.
3. Click **Accept & Verify**. Show the updated status and immutable audit record.

---

### Scenario 2: Adaptive Evidence Recapture (Targeted Missing Angle)

**Narrative**: The farmer submits evidence but accidentally omits the critical `closeup_damage` angle. Rather than rejecting the claim or demanding all 5 photos again, Fasal-Pramaan triggers targeted adaptive recapture.

```mermaid
sequenceDiagram
  autonumber
  Farmer->>Mobile App: 1. Submits 4 Angles (Ommits closeup_damage)
  Worker->>Evidence Engine: 2. Evaluates: Quality=88, Coverage=60, Final=72.4 (Uncertainty: Coverage)
  Reviewer->>Dashboard: 3. Case flagged: 'Coverage Uncertainty - Closeup Missing'
  Reviewer->>Dashboard: 4. Clicks 'Request Recapture' -> Sends targeted request
  Farmer->>Mobile App: 5. Receives instruction: 'Capture close-up of affected leaves'
  Farmer->>Mobile App: 6. Captures ONLY the 1 missing angle & uploads
  Worker->>Evidence Engine: 7. Re-evaluates -> New Confidence: 89.2 (+16.8 Delta)
  Reviewer->>Dashboard: 8. Reviews updated evidence -> Accepts Claim
```

1. **Demonstrate the Gap**: Show the case in the Reviewer Dashboard with Evidence Confidence `72.4 / 100` and `Uncertainty: Coverage (High)`.
2. **Reviewer Action**: Click **Request Recapture**. Point out that the system auto-selects `["closeup_damage"]` and provides bilingual farmer instructions.
3. **Farmer Action**: Open the Farmer app. Notice the notification: *"Additional evidence required: Close-up damage photo"*. Tapping it opens guided capture in `specific_recapture` mode, requesting **only** the 1 missing photo.
4. **Re-Evaluation**: Upload the photo. Refresh the Reviewer Dashboard to show the **Confidence Delta**:
   $$\text{Previous: } 72.4 \longrightarrow \text{New: } 89.2 \quad (\Delta C = +16.8)$$
   The case updates to `pending_review` and is accepted.

---

### Scenario 3: Anti-Fraud & Integrity Gate (Duplicate Checksum Rejection)

**Narrative**: An attempted fraudulent submission reuses the same downloaded leaf photo across multiple angles. The engine catches the duplicate cryptographic checksum, imposes hard penalties, and routes the case directly to human anti-fraud investigation.

```mermaid
sequenceDiagram
  autonumber
  Fraudster->>API: Submits duplicate image bytes across angles
  Worker->>Evidence Engine: Computes SHA-256 & pHash collisions
  Evidence Engine->>Evidence Engine: Deducts Integrity Score (-65.0) -> Final Confidence = 35.0
  Evidence Engine->>API: Uncertainty: 'Integrity' (Critical) -> Action: 'human_review'
  API->>Dashboard: Enqueues directly to Anti-Fraud Reviewer Queue
  Reviewer->>Dashboard: Inspects Duplicate Flag -> Clicks 'Reject Claim' with reason
```

1. **Demonstrate Protection**: Show that even if an image is visually sharp ($S_{\text{Quality}} = 95.0$), a cryptographic or perceptual hash collision immediately drops $S_{\text{Integrity}}$ to $35.0$.
2. **Strict Escalation**: Highlight that the automated recapture engine **refuses to issue an automated retake** for integrity breaches, requiring explicit human reviewer adjudication to protect the insurance pool.
3. **Reviewer Action**: Reviewer clicks **Reject Claim** and logs the reason *"Fraudulent duplicate photo detected across angles"*.

---

### Scenario 4: Hands-Free Voice Capture (Fasal Saathi on Gemini Live)

**Narrative**: A farmer working hands-free in the field speaks natural Hindi or English to register plots, capture photos, and query claim status.

1. In the Mobile App (`:8085`), tap **Talk to Fasal Saathi**.
2. Speak: *"मेरे खेत दिखाओ"* $\rightarrow$ Assistant reads back registered farms.
3. Speak: *"फोटो खींचो"* $\rightarrow$ Assistant triggers the camera capture shutter.
4. Speak: *"क्यू सिंक करो"* $\rightarrow$ Assistant confirms the action before executing sync.
