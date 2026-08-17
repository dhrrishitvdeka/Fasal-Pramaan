# Contributing to Fasal-Pramaan

Thank you for contributing to Fasal-Pramaan. We welcome community contributions, architectural improvements, and bug fixes.

---

## 1. Development Workflow

1. **Review Technical Specs**: Read [System Architecture](docs/architecture.md), [Evidence Evaluation](docs/evidence-evaluation.md), and [API Reference](docs/api.md).
2. **Branch Naming**: Use descriptive branch prefixes:
   - `feat/feature-name` (New capability or enhancement)
   - `fix/bug-description` (Bug or defect fix)
   - `docs/doc-update` (Documentation improvements)
   - `perf/optimization` (Performance enhancements)
3. **Security Standards**: Never commit `.env`, private keys, secrets, or real personal data.

---

## 2. Automated Quality Assurance Checks

All pull requests must pass the complete automated verification suite:

```powershell
# 1. API & Evidence Engine Unit Tests
docker compose exec api pytest -v

# 2. AI Model Inference Tests
docker compose exec ai pytest -v

# 3. Next.js Dashboard Build, Lint & Typecheck
cd apps/dashboard
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
cd ../..

# 4. Flutter Mobile Static Analysis & Tests
docker build --target tester -t fasalpramaan-mobile-test apps/mobile
```

---

## 3. Pull Request Guidelines

- **Clear Description**: Summarize the architectural motivation, changes made, and verification steps executed.
- **Atomic Commits**: Keep unrelated refactors separate from functional feature commits.
- **Code of Conduct**: All contributors are expected to uphold our [Code of Conduct](CODE_OF_CONDUCT.md).
