# Security Policy & Vulnerability Reporting

## 1. Supported Versions

Security updates and vulnerability patches are actively maintained and applied to the default `main` branch.

---

## 2. Reporting a Vulnerability

If you discover a potential security vulnerability within Fasal-Pramaan, please report it responsibly:

1. **GitHub Private Vulnerability Reporting**: Use the **Security $\rightarrow$ Report a vulnerability** tab on GitHub.
2. **Private Email Disclosure**: If private GitHub reporting is unavailable, contact the project maintainers via the contact details listed on their GitHub profile.

Please include:
- Affected component, endpoint, or module.
- Step-by-step reproduction instructions or proof-of-concept.
- Potential impact and suggested remediation if known.

*Please do not report security vulnerabilities via public GitHub issues.*

---

## 3. Security Guidelines & Best Practices

- **Never Commit Secrets**: Ensure `.env` and sensitive API keys are excluded from version control.
- **Server-Side Credentials**: High-privilege tokens (such as `GEMINI_API_KEY`) must reside exclusively on the server and never be distributed to client binaries.
- **Immediate Credential Rotation**: If credentials or keys are inadvertently exposed, revoke and rotate them immediately across all environments.

For complete architectural security specifications, see [Security Architecture](docs/security.md).
