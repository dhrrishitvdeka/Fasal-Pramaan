# FasalPramaan field app

Flutter app for farmer and field-officer evidence capture. It provides guided
three-angle capture, GPS policy, encrypted offline persistence, resumable
upload, and submission status.

## Presentation build

The app is part of the root Docker Compose stack:

```powershell
docker compose up -d --build
```

Open `http://localhost:8085`. The web build uses `/backend`, proxied by Nginx
to the API container, so it works unchanged on localhost or another LAN
device.

Demo accounts:

- `farmer@fasalpramaan.local` / `Demo@12345`
- `officer@fasalpramaan.local` / `Demo@12345`

## Reproducible checks

```powershell
docker build --target tester -t fasalpramaan-mobile-test apps/mobile
docker compose build mobile
```

The production image compiles Flutter in a pinned SDK builder and serves only
the release web output from Nginx.

## Native development

Android emulator:

```powershell
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:8000
```

Physical device: use the Docker host's LAN IP and allow the API port on a
trusted network. A release native build must use HTTPS; the same-origin
`/backend` exception is only for the containerized web app.

Use synthetic data only. A mobile client can detect common mock-location
signals but cannot independently prove physical location authenticity.
