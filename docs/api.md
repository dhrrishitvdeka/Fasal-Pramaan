# API reference for the presentation demo

Base URL (host-mapped API): `http://localhost:8000`  
Version prefix: `/api/v1`  
Browser clients in Docker call same-origin **`/backend`** (dashboard rewrite / mobile nginx), which proxies to the API container.  
Local interactive docs (development environments only): `http://localhost:8000/docs`

This page summarizes the API behavior used by the local demonstration. The OpenAPI interface remains the route-level contract.

## Authentication and sessions

| Route | Purpose | Notes |
|---|---|---|
| `POST /auth/register` | Create a farmer account | Public registration is farmer-only; new account is not falsely marked verified |
| `POST /auth/login` | Receive access and refresh tokens | Demo accounts are seeded locally |
| `POST /auth/refresh` | Rotate refresh token | Reuse detection revokes the token family |
| `POST /auth/logout` | End session | Invalidates refresh family and current access-token version |
| `GET /auth/me` | Current user profile/roles | Requires Bearer access token |

```http
Authorization: Bearer <access_token>
```

Access tokens are short-lived. The dashboard/mobile clients refresh them during a running session; the dashboard intentionally keeps them in memory rather than browser storage.

## Role and data scope

| Actor | Data scope | Key actions |
|---|---|---|
| Farmer | Own farms, cycles and submissions | Capture/sync evidence; view status |
| Field officer | Assigned jurisdiction and descendants | Assist capture only within jurisdiction |
| Reviewer | Review/dashboard scope | Review, correct, request recapture, inspect |
| Admin | Administrative scope | User/settings/audit administration |

Every protected object route validates ownership or jurisdiction. The API does not grant a field officer global farmer access.

## Evidence lifecycle routes

| Route | Purpose | Important validation |
|---|---|---|
| `POST /submissions/drafts` | Create/resume idempotent draft | Cycle access, GPS/capture metadata, unique client key |
| `POST /submissions/{id}/upload-urls` | Request signed evidence uploads | Required media type, declared size/hash, duplicate handling |
| `POST /submissions/{id}/images/confirm` | Confirm uploaded images | Server observes object existence and metadata |
| `POST /submissions/{id}/finalize` | Submit a complete case | Required angles, observed size/type/SHA/image bytes; queues processing |
| `GET /submissions` / `GET /submissions/{id}` | Read status/evidence metadata | Ownership or authorized scope |
| `POST /submissions/{id}/retry-processing` | Retry safe processing | Authorized case access |

The signed PUT request includes the expected content type and content length. Confirmation/re-finalization still verifies the actual stored object; client metadata alone is never trusted.

## Review routes

| Route | Purpose |
|---|---|
| `GET /review/queue` | Reviewable cases |
| `GET /review/{id}` | Case detail |
| `POST /review/{id}/action` | `accept`, `correct`, `reject`, `request_recapture`, `physical_inspection`, or `complete` as state allows |
| `GET /review/{id}/history` | Review and audit history |

Overrides require an `override_reason`. A rejection clears any misleading final severity rather than leaving stale AI/human assessment values visible as final.

## Dashboard and system routes

| Route | Intended role |
|---|---|
| `GET /dashboard/overview` | Reviewer/admin |
| `GET /dashboard/map/markers` | Reviewer/admin |
| `GET /dashboard/analytics/*` | Reviewer/admin |
| `GET /dashboard/notifications` | Authorized user |
| `GET /health` | Local stack health |

## Error behavior

- Authentication and authorization failures return `401` or `403` without revealing protected-object details.
- Validation failures return structured `422` or domain `400/409` responses.
- Unexpected failures are sanitized and include a correlation ID for local diagnostics.
- Outside development/test/local environments, OpenAPI/docs routes are disabled.

For the exact endpoint schemas, start the local stack and use `/docs`. For the presentation sequence, use [demo-walkthrough.md](./demo-walkthrough.md).
