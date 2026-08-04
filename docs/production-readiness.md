# Production-readiness gates

**Current decision:** local, controlled presentation demo only. This checklist is intentionally not marked complete by a successful local Docker run.

## Platform and security

- [ ] Managed secret store, documented rotation, and no demo credentials.
- [ ] TLS/WAF ingress; DB, Redis, object storage and AI on private networks.
- [ ] Managed PostgreSQL/PostGIS backups and tested restore procedure.
- [ ] Versioned evidence store with lifecycle/retention, malware/content scanning and access logging.
- [ ] Real account verification/recovery provider and operational support process.
- [ ] Observability, alerting, incident response and independent penetration test.
- [ ] Reviewer claim/assignment and complete operational audit workflow.

## Privacy and programme

- [ ] Privacy impact assessment and legal basis for geolocation/evidence collection.
- [ ] Consent, retention, deletion and access policies for farmer evidence.
- [ ] Approved PMFBY/YESTECH or insurer interface specifications and contracts, if integration is requested.

## AI and assessment

- [ ] Lawful, representative field dataset across target crops, stages, perils, regions and devices.
- [ ] Independent train/validation/test protocol without farm/time leakage.
- [ ] Per-crop/peril/subgroup metrics, calibration, abstention and human-review workload evidence.
- [ ] Prospective field pilot, model card, drift monitoring, rollback and authority approval.
- [ ] Explicit policy defining where a human must decide.

Until every relevant gate is met, use the approved presentation wording in [known-limitations.md](./known-limitations.md).
