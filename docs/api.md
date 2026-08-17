# API Reference & Data Contracts

Base URL (Direct API Gateway): `http://localhost:8000`  
Version Prefix: `/api/v1`  
Interactive OpenAPI Documentation (Swagger UI): `http://localhost:8000/docs`  
Alternative ReDoc Specification: `http://localhost:8000/redoc`

*Note: In Docker environments, browser clients use the same-origin `/backend` proxy (Next.js rewrite on port `3000` and Nginx reverse proxy on port `8085`), which seamlessly forwards requests to `http://api:8000`.*

---

## 1. Authentication & Session Management

### Headers
All protected routes require standard Bearer Token authorization:
```http
Authorization: Bearer <access_token>
```

### Endpoints

| Method | Endpoint | Access Level | Description |
|---|---|---|---|
| `POST` | `/auth/register` | Public | Register a new farmer account (`full_name`, `email`, `password`, `phone`). |
| `POST` | `/auth/login` | Public | Authenticate with email/password; returns short-lived access token and refresh token. |
| `POST` | `/auth/refresh` | Public | Rotate refresh token with token-family reuse detection. |
| `POST` | `/auth/logout` | Authenticated | Revoke refresh token family and increment user `token_version`. |
| `GET` | `/auth/me` | Authenticated | Retrieve current user profile, roles, and assigned jurisdiction scopes. |

#### Login Request & Response Example
```http
POST /api/v1/auth/login HTTP/1.1
Content-Type: application/json

{
  "email": "farmer@fasalpramaan.local",
  "password": "Demo@12345"
}
```

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "8f3b2a19-4c12-4f81-9b24-7e912384a101",
  "token_type": "bearer",
  "expires_in": 1800,
  "user": {
    "id": "2b3c4d5e-6f7a-8b9c-0d1e-2f3a4b5c6d7e",
    "email": "farmer@fasalpramaan.local",
    "full_name": "Ramesh Kumar",
    "roles": ["farmer"],
    "preferred_language": "hi"
  }
}
```

---

## 2. Farm, Plot & Crop Cycle Management

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/farms` | List all farms owned by the farmer or within the field officer's jurisdiction. |
| `POST` | `/farms` | Create a new farm record with village jurisdiction binding. |
| `GET` | `/farms/{id}/plots` | List all spatial plots associated with a farm. |
| `POST` | `/farms/{id}/plots` | Register a new plot with GeoJSON boundary geometry and centroid. |
| `GET` | `/crop-cycles` | List active and historical crop cycles. |
| `POST` | `/crop-cycles` | Initialize a new crop cycle on a plot (e.g., Kharif Paddy 2026). |
| `GET` | `/crop-types` | Retrieve the reference crop catalog (Maize, Paddy, Potato, Wheat). |

---

## 3. Evidence Capture & Submission Lifecycle

### 3.1 Draft Creation (`POST /submissions/drafts`)
Initializes an idempotent submission container with GPS coordinates and client metadata.

```json
// Request Body
{
  "crop_cycle_id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
  "growth_stage_id": "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e",
  "farmer_observations": "Severe yellowing and leaf lesions observed across the lower canopy.",
  "capture_lat": 28.6139,
  "capture_lon": 77.2090,
  "capture_accuracy_m": 8.5,
  "capture_timestamp": "2026-08-17T10:30:00Z",
  "device_id": "android-pixel7-98412",
  "offline_created": true,
  "idempotency_key": "draft-ramesh-cycle-2026-08-17-001"
}
```

### 3.2 Request Upload URLs (`POST /submissions/{id}/upload-urls`)
Requests presigned S3 PUT URLs for the 5 canonical angles.

```json
// Request Body
{
  "images": [
    {
      "angle_type": "wide_field",
      "sequence_order": 1,
      "content_type": "image/jpeg",
      "byte_size": 2451920,
      "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "width": 4032,
      "height": 3024
    },
    {
      "angle_type": "left_context",
      "sequence_order": 2,
      "content_type": "image/jpeg",
      "byte_size": 2189400,
      "sha256": "ca978112ca1bbdcafac231b39a23dc4da78607f9c2f960000000000000000001",
      "width": 4032,
      "height": 3024
    }
  ]
}
```

```json
// Response Body
{
  "submission_id": "f8a1e230-b741-4cf0-9852-192a8310c952",
  "uploads": [
    {
      "image_id": "c1e0a293-1284-482a-a921-99884120ab11",
      "angle_type": "wide_field",
      "object_key": "submissions/f8a1e230-b741-4cf0-9852-192a8310c952/c1e0a293.jpg",
      "upload_url": "http://localhost:9000/evidence-vault/submissions/f8a1e230...?...signed-params",
      "method": "PUT",
      "headers": {
        "Content-Type": "image/jpeg",
        "Content-Length": "2451920"
      }
    }
  ]
}
```

### 3.3 Confirm Uploads (`POST /submissions/{id}/images/confirm`)
Confirms that files have been successfully transferred to object storage.

```json
{
  "image_id": "c1e0a293-1284-482a-a921-99884120ab11",
  "etag": "\"9b10e43f0ba980c855e5c80eecd383d4\""
}
```

### 3.4 Finalize Submission (`POST /submissions/{id}/finalize`)
Locks the submission draft, performs server-side byte verification, enqueues the Celery background processing task, and returns the active submission status.

---

## 4. Review & Adjudication Endpoints

| Method | Endpoint | Role | Description |
|---|---|---|---|
| `GET` | `/review/queue` | Reviewer / Admin | List cases pending human review with filters for evidence confidence, uncertainty, and crop. |
| `GET` | `/review/{id}` | Reviewer / Admin | Retrieve full case dossier including images, 4-component trust scores, and AI prediction. |
| `POST` | `/review/{id}/action` | Reviewer / Admin | Execute an adjudication action (`accept`, `correct`, `reject`, `request_recapture`, `physical_inspection`). |
| `GET` | `/review/{id}/history` | Reviewer / Admin | Inspect the complete chronological audit log of human overrides and state changes. |

### Adjudication Action Payload (`POST /review/{id}/action`)

```json
{
  "action": "request_recapture",
  "override_reason": "Close-up leaf shot is blurry and lacks sufficient detail to diagnose fungal blast.",
  "required_angles": ["closeup_damage"],
  "notes": "Please instruct the farmer to hold the camera steady in daylight."
}
```

---

## 5. Evidence Reminders & Voice Bridge

### Evidence Reminders
- `GET /evidence-reminders`: Returns the farmer's recurring evidence capture schedules.
- `PUT /evidence-reminders/{cycle_id}`: Configures cadence (14–90 days) and target photo preferences.
- `POST /evidence-reminders/{cycle_id}/snooze`: Postpones an active reminder by 1–7 days.

### Voice Bridge (Fasal Saathi on Gemini Live)
- `POST /voice/session-token`: Mints a short-lived ephemeral session token for the authenticated farmer.
- `WS /voice/live`: Full-duplex WebSocket proxy streaming 16 kHz audio between client and Gemini Live.
- `POST /voice/actions/audit`: Logs verified tool executions (draft creation, sync trigger, language toggle).
