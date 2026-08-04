# Known limitations and product boundaries

## Model limitations

The default `crop_health_v4` adapter is a locally trained DINOv2 ViT-S/14 leaf
classifier covering maize, paddy/rice, potato, and wheat. Its licensed,
checksum-locked 58,516-image manifest includes controlled and field-style
sources, and it passed the pre-frozen internal promotion gates on an immutable
12,167-image test. This still is not a representative deployment study:
capture protocols, locations, devices, seasons, and class support vary, and
there is no independent field validation. A/B/C/U are screening buckets only.
Potato healthy is the disclosed weakest class (16 test examples, recall 0.25,
F1 0.32). The legacy `plant_disease` MobileNet evaluation remains
**25/60 (41.67%)** on synthetic PlantVillage-style validation images.

It must not be presented as able to:

- approve or pay crop-insurance claims;
- reliably identify soybean, cotton, or every target crop and field condition;
- detect every peril, including flood, lodging, water stress, or hail;
- determine growth stage, affected area, or insurance severity from the shipped model;
- replace a human reviewer or physical inspection.

The application preserves this boundary by marking predictions non-production and routing incomplete/uncertain cases to recapture or physical inspection.

## Local-data limitations

- Seed creates demo accounts and reference catalogs only; farms, cycles, and
  submissions are created during use.
- The local MinIO bucket is a development evidence store, not a governed retention system.
- Docker field app is available at `http://localhost:8085`; native Android/iOS still need a local Flutter toolchain.
- The local stack demonstrates workflow behavior; it does not prove field accuracy, farmer adoption, or programme integration.

## Platform limitations still open

| Area | Current position | Next step |
|---|---|---|
| Reviewer concurrency | No explicit case claim/lease | Add reviewer claim/assignment workflow |
| Alerts/export | Basic view/export behavior | Add acknowledgement and richer export fields |
| Object lifecycle | Integrity checks exist | Add AV/content scanning, retention and legal-hold policy |
| Account verification | `is_verified` stored; not enforced on write APIs | Integrate SMS/email/identity and gate writes |
| Geo / plot proximity | Soft anomaly flags; finalize requires GPS but not hard geofence fail | Product policy for hard-fail vs advisory |
| Recapture AI inputs | Finalize scopes new angles; worker may still load all uploaded images | Scope worker payload to recapture window |
| Admin settings UI | Writes allowlisted DB settings | Wire into runtime rules or remove dead controls |
| Mobile verification | Docker web + unit tests; physical-device CI optional | Device-lab / CI Flutter jobs |
| Model readiness | Internal gates passed; non-production assist only | Independent, protocol-matched field validation |

## Accurate product claims

Accurate: “AI-assisted evidence review with mandatory human validation.”

Inaccurate: “AI insurance approval,” “production-validated model,” or “live
PMFBY/YESTECH integration.”

See [ai-service.md](./ai-service.md) for model details and
[demo-walkthrough.md](./demo-walkthrough.md) for an end-to-end local walkthrough.
