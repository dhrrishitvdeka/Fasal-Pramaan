# Fasal-Pramaan Field Application

The **Fasal-Pramaan Field Application** is a multi-platform Flutter application (supporting Native Android, iOS, and containerized Web) built for farmers and agricultural field officers. It facilitates guided 5-angle evidence capture, real-time visual quality checks, encrypted offline vault storage, and idempotent background synchronization.

---

## 1. Core Capabilities

- **Guided 5-Angle Capture Engine**: Step-by-step spatial photo guidance for `wide_field`, `left_context`, `mid_canopy`, `right_context`, and `closeup_damage`.
- **Pre-Capture Quality Probes**: On-device detection of motion blur, underexposure/overexposure, sub-standard resolution, and mock/simulated GPS providers.
- **Cryptographic Offline Vault**: Field-level AES-GCM-256 encryption ensuring offline evidence captured in remote areas is protected against tampering.
- **Adaptive Recapture Mode**: Seamlessly switches between full 5-angle capture and targeted single-angle retake based on backend evaluation requests.
- **Fasal Saathi Spoken Assistant**: Dual-channel 16 kHz PCM audio streaming bridge enabling hands-free field capture in Hindi and English via Gemini Live.

---

## 2. Running in Docker (Web Build)

The application is compiled and served automatically as part of the root Docker stack:

```bash
docker compose up -d --build mobile
```

Access the field application at `http://localhost:8085`.

---

## 3. Native Mobile Development

### Android Emulator Setup
```bash
cd apps/mobile
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:8000
```

### Physical Device Setup
To run on a physical phone connected over the same local Wi-Fi:
```bash
flutter run --dart-define=API_BASE_URL=http://<HOST_LAN_IP>:8000
```

---

## 4. Verification & Testing

```bash
# Execute static analysis and unit test suite
docker build --target tester -t fasalpramaan-mobile-test apps/mobile
```
