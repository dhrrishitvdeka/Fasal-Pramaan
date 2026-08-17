# Release Engineering & Quality Gates

This document defines the release lifecycle, automated verification gates, and versioning standards for Fasal-Pramaan.

---

## 1. Automated Release Verification Gates

Before tagging any release revision, the following automated quality checks must pass with zero errors:

```bash
# 1. API Gateway & Evidence Engine Tests
docker compose exec api pytest -v

# 2. AI Vision Transformer & Model Tests
docker compose exec ai pytest -v

# 3. Next.js Dashboard Build, Lint & Typecheck
cd apps/dashboard
npm run lint
npm run typecheck
npm test
npm run build
cd ../..

# 4. Flutter Mobile Analysis & Tests
docker build --target tester -t fasalpramaan-mobile-test apps/mobile

# 5. Full End-to-End Automated Pipeline Verification
powershell -ExecutionPolicy Bypass -Command "& .\scripts\verify-e2e.ps1 -ImagePaths @('wide.jpg','left.jpg','mid.jpg','right.jpg','close.jpg')"
```

---

## 2. Release Packaging & Clean Slate Protocol

1. **Clean Slate Verification**: Execute the operational reset script to verify the deployment ships with only pre-seeded catalogs and reference accounts:
   ```bash
   docker compose exec api python scripts/clear_operational_data.py --confirm-local-reset
   ```
2. **Secrets & PII Scan**: Verify that `.env` and local media storage directories are excluded from Git staging.
3. **Generate Portable Offline Bundle**:
   ```bash
   powershell -ExecutionPolicy Bypass -File .\scripts\build-portable-bundle.ps1
   ```

---

## 3. Versioning Standards

Fasal-Pramaan adheres strictly to [Semantic Versioning 2.0.0](https://semver.org/):
- **Major (`X.0.0`)**: Breaking database migrations or incompatible API contract revisions.
- **Minor (`0.Y.0`)**: New feature additions, new AI model adapters, or scoring engine enhancements.
- **Patch (`0.0.Z`)**: Security fixes, UI refinements, and performance optimizations.
