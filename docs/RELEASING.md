# Releasing

## Pre-release checklist

1. Run every check in [CONTRIBUTING.md](../CONTRIBUTING.md).
2. Run `scripts/verify-e2e.ps1` and confirm the classified submission appears
   in the reviewer queue with five images.
3. Run the operational-data reset and verify the repository ships with only
   the four demo accounts and reference catalogs.
4. Confirm `.env` is ignored and scan the staged tree for secrets, personal
   data, captured evidence, generated builds, and dependency folders.
5. Update [CHANGELOG.md](../CHANGELOG.md) and version identifiers
   (`services/*/app/__init__.py`, `apps/mobile/pubspec.yaml`,
   `apps/dashboard/package.json`).
6. Create an annotated tag such as `v1.1.0` only after the release commit is
   reviewed.

## GitHub repository settings

- Set the default branch to `main`.
- Require the CI workflow on pull requests.
- Enable Dependabot alerts and secret scanning.
- Enable private vulnerability reporting.
- Do not publish the local `.env` or Docker volumes.

The checked-in model is internally evaluated but not independently field
validated. Releases must retain that limitation and mandatory human review.
