FROM debian:bookworm-slim AS flutter-base

ARG FLUTTER_VERSION=3.44.7

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl git xz-utils \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL \
      "https://storage.googleapis.com/flutter_infra_release/releases/stable/linux/flutter_linux_${FLUTTER_VERSION}-stable.tar.xz" \
      -o /tmp/flutter.tar.xz \
    && tar -xf /tmp/flutter.tar.xz -C /opt \
    && rm /tmp/flutter.tar.xz \
    && git config --global --add safe.directory /opt/flutter

ENV PATH="/opt/flutter/bin:/opt/flutter/bin/cache/dart-sdk/bin:${PATH}"
ENV CI=true
ENV FLUTTER_SUPPRESS_ANALYTICS=true

WORKDIR /app
COPY pubspec.yaml pubspec.lock ./
RUN flutter pub get
COPY . .

FROM flutter-base AS tester
RUN flutter analyze && flutter test

FROM flutter-base AS web-builder
# Re-declare build arg inside the stage (Docker does not inherit pre-FROM ARGs).
ARG API_BASE_URL=/backend
# Gate the production image on analyze + unit tests.
COPY --from=tester /app/pubspec.lock /tmp/.flutter-tests-passed
RUN flutter build web --release \
    --dart-define=API_BASE_URL=${API_BASE_URL} \
    --dart-define=DEMO_MODE=false

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-builder /app/build/web /usr/share/nginx/html
EXPOSE 8085
HEALTHCHECK --interval=10s --timeout=3s --retries=10 \
  CMD wget -qO- http://127.0.0.1:8085/healthz || exit 1
