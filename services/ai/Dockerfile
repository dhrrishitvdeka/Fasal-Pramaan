FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --default-timeout=120 -r requirements.txt

COPY . .

RUN useradd --create-home --uid 10001 appuser && chown -R appuser:appuser /app

# Bake fine-tuned weights when present at build time
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1
ENV AI_MODEL_ADAPTER=crop_health_v4
ENV AI_ALLOW_MOCK_FALLBACK=false

EXPOSE 8001

USER appuser

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
