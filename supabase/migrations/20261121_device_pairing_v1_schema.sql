-- ROOTS_GRILL_DEVICE_PAIRING_V1_SCHEMA
-- Additive pairing request table. No existing screens, tokens, players or URLs changed.
BEGIN;
CREATE TABLE IF NOT EXISTS public.grill_pairing_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL UNIQUE,
  claim_secret_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','claimed','expired','cancelled')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  claimed_at timestamptz,
  screen_id text REFERENCES public.grill_screens(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id),
  CHECK (char_length(code_hash) = 64),
  CHECK (char_length(claim_secret_hash) = 64)
);
CREATE INDEX IF NOT EXISTS grill_pairing_requests_expiry_idx
  ON public.grill_pairing_requests (expires_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS grill_pairing_requests_screen_idx
  ON public.grill_pairing_requests (screen_id);
ALTER TABLE public.grill_pairing_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.grill_pairing_requests FROM anon, authenticated;
-- Pairing endpoint will use service-role on server; no browser database access.
COMMIT;
SELECT 'ROOTS_GRILL_DEVICE_PAIRING_V1_SCHEMA installed' AS result;
