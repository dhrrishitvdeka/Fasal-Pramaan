# Rollback

The previous vendored public model remains available as adapter `crop_vit`.

For Docker, set `AI_MODEL_ADAPTER=crop_vit` in `.env`, then run:

```bash
docker compose up -d --force-recreate ai api worker
```

Verify `http://localhost:8001/health` reports `default_adapter: crop_vit`.
Restore the experimental demo adapter with `AI_MODEL_ADAPTER=crop_health_v3`.
Neither adapter is production validated.
