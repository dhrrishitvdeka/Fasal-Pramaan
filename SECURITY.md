# Security policy

## Supported versions

Security fixes are applied to the latest revision of the default branch. This
local reference deployment is not a hosted production claims system.

## Reporting a vulnerability

Use GitHub private vulnerability reporting when it is enabled for the
repository. Do not disclose credentials, tokens, personal data, farmer
evidence, or exploit details in a public issue.

If private reporting is unavailable, contact the repository maintainer through
the private contact method listed on their GitHub profile. Include affected
versions, reproduction steps, impact, and a suggested mitigation when known.

## Secrets

- Never commit `.env` or API keys.
- Gemini credentials stay server-side; clients receive constrained one-use
  session tokens.
- Rotate any credential immediately if it appears in a commit, log, screenshot,
  issue, or pull request.

See [security architecture](docs/security.md) and
[production-readiness boundaries](docs/production-readiness.md).
