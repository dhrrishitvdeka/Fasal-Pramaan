# Rollback

Set `AI_MODEL_ADAPTER=crop_health_v3` and restart the AI service. The v3 ONNX
artifact remains vendored and its adapter is still registered. For the older
public checkpoint, use `AI_MODEL_ADAPTER=crop_vit`.

Rollback does not change the safety boundary: all model versions require human
review and must not emit severity, affected area, quality, claim, or payout
decisions.
