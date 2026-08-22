-- Peril + intent + gate + context signals for web claims (idempotent)
ALTER TABLE web_claims ADD COLUMN IF NOT EXISTS peril text DEFAULT 'normal', ADD COLUMN IF NOT EXISTS intent_id text, ADD COLUMN IF NOT EXISTS gate_result jsonb, ADD COLUMN IF NOT EXISTS context_signals jsonb, ADD COLUMN IF NOT EXISTS adaptive_result jsonb;
ALTER TABLE web_claim_images ADD COLUMN IF NOT EXISTS gate_result jsonb;
