# Fasal-Pramaan Documentation Index

Welcome to the comprehensive technical documentation for **Fasal-Pramaan (*फसल प्रमाण*)**.

---

## Core System Architecture & Engine Specifications

| Document | Description |
|---|---|
| [**architecture.md**](architecture.md) | Distributed microservice architecture, layer boundaries, data flow, and spatial jurisdiction model. |
| [**evidence-evaluation.md**](evidence-evaluation.md) | Mathematical specification of the 4-Dimensional Evidence Confidence & Trust Evaluation Engine ($0.4Q + 0.3C + 0.2X + 0.1I$). |
| [**adaptive-recapture.md**](adaptive-recapture.md) | Targeted evidence recapture workflow, reason codes, state transitions, and confidence delta calculations. |
| [**api.md**](api.md) | Complete OpenAPI/REST endpoint specifications, schemas, request/response models, and error codes. |
| [**ai-service.md**](ai-service.md) | Assistive Vision Transformer service architecture, DINOv2 ViT-S/14 ONNX pipeline, and $A/B/C/U$ screening taxonomy. |
| [**AI_MODEL_MVP.md**](AI_MODEL_MVP.md) | Frozen model card, benchmark evaluation metrics (12,167 test samples), ECE calibration, and label maps. |

---

## Operational, Security & Governance Standards

| Document | Description |
|---|---|
| [**offline-sync.md**](offline-sync.md) | Offline-first mobile architecture, local AES-GCM encrypted vault, and idempotent background sync engine. |
| [**security.md**](security.md) | Defense-in-depth security model, RBAC, JWT rotation, and anti-fraud cryptographic verification. |
| [**production-readiness.md**](production-readiness.md) | Enterprise multi-AZ deployment topology, infrastructure hardening, and high-availability SLAs. |
| [**governance-and-safety.md**](governance-and-safety.md) | Ethical AI principles, human-in-the-loop safeguards, crop coverage matrix, and operational risk controls. |
| [**known-limitations.md**](known-limitations.md) | Operational scope boundaries, screening vs. settlement definitions, and calibrated abstention policies. |
| [**environment-variables.md**](environment-variables.md) | Complete configuration parameter reference for `.env` and Docker Compose. |
| [**deployment.md**](deployment.md) | Deployment guides for local reference, trusted LAN exhibition, and cloud container orchestration. |

---

## Showcase & Interactive Guides

| Document | Description |
|---|---|
| [**demo-walkthrough.md**](demo-walkthrough.md) | Step-by-step MUN exhibition walkthrough and structured demonstration scenarios. |
| [**VOICE_ASSISTANT_DEMO.md**](VOICE_ASSISTANT_DEMO.md) | Fasal Saathi Gemini Live full-duplex spoken assistant architecture and spoken demo script. |
| [**EVIDENCE_REMINDERS.md**](EVIDENCE_REMINDERS.md) | Recurring evidence capture schedules, background beat workers, and farmer notification engine. |
| [**finetune-public-data.md**](finetune-public-data.md) | Model architecture research, public dataset provenance, and fine-tuning procedures. |
| [**RELEASING.md**](RELEASING.md) | Release engineering protocols, automated quality gates, and versioning standards. |

---

## Root Level Guides
- [**GETTING_STARTED.md**](../GETTING_STARTED.md) — First-time clone, environment setup, and quickstart.
- [**RUN_GUIDE.md**](../RUN_GUIDE.md) — Day-to-day operations, testing commands, and diagnostics.
- [**CONTRIBUTING.md**](../CONTRIBUTING.md) — Contribution standards, pull request requirements, and QA checks.
- [**SECURITY.md**](../SECURITY.md) — Security policy and vulnerability disclosure procedures.
- [**CHANGELOG.md**](../CHANGELOG.md) — Version history and release notes.
