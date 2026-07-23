# 10-minute presentation speaker script

Use this script with [GETTING_STARTED.md](../GETTING_STARTED.md). It describes the local synthetic demo only.

| Time | Screen/action | Suggested narration |
|---|---|---|
| 0:00–0:45 | README architecture flow | “FasalPramaan creates a traceable path from field evidence to a human-reviewed outcome.” |
| 0:45–1:30 | API and AI health tabs | “The local stack includes API, evidence storage, queue, worker, AI service and Command Centre.” |
| 1:30–3:00 | Reviewer login → Overview | “Reviewers see workload and case visibility in one place.” |
| 3:00–4:00 | Map | “These markers are synthetic demo submissions, shown to illustrate geographic evidence visibility.” |
| 4:00–5:30 | Review Queue → case evidence | “Each case carries captured metadata and evidence. The platform verifies uploaded bytes before processing.” |
| 5:30–6:30 | ViT health-grade panel/disclaimer | “The local ViT produces an A/B/C/U crop-health screening bucket. It is explicitly non-production, abstains on unsupported inputs, and cannot auto-settle a claim.” |
| 6:30–7:45 | Correct action + reason | “A human reviewer can correct the assessment. The reason becomes part of the audit trail.” |
| 7:45–8:45 | Status/audit history | “The workflow keeps a record of evidence, model assistance and the human decision.” |
| 8:45–10:00 | README limits / close | “The next step is independent field validation and partner/governance work—not claiming insurance-grade model accuracy today.” |

## Required statements

- “All visible records are synthetic demonstration data.”
- “The shipped model is not production validated and does not make insurance decisions.”
- “The screening grade is not disease severity, produce quality, yield loss, or claim eligibility.”
- “A reviewer remains responsible for acceptance, correction, recapture, rejection, or physical inspection.”

## Avoid saying

- “The AI approves claims.”
- “This is PMFBY/YESTECH integrated.”
- “The model detects every crop-loss peril.”
- “GPS makes fraud impossible.”

## Demo credentials

Reviewer: `reviewer@fasalpramaan.local` / `Demo@12345`
Farmer: `farmer@fasalpramaan.local` / `Demo@12345`

If anything fails, pause and use the recovery table in [GETTING_STARTED.md](../GETTING_STARTED.md); do not improvise a production claim.
