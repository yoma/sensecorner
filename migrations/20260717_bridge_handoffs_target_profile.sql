-- Optional dossier focus for Gateway → domain-app bridge handoff.
ALTER TABLE public.bridge_handoffs
  ADD COLUMN IF NOT EXISTS target_profile text;

COMMENT ON COLUMN public.bridge_handoffs.target_profile IS
  'Optional contact/dossier name in the target app to open Vertel on after Gateway bridge.';
