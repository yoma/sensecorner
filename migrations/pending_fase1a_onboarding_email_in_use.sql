-- PENDING – NIET UITVOEREN zonder expliciete goedkeuring.
-- SenseCorner Fase 1A: verwijder e-mailenumeratie uit onboarding_email_in_use.
--
-- VOORAF (rollback-anker): in SQL Editor draaien en bewaren:
--   select pg_get_functiondef(p.oid)
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'onboarding_email_in_use';
--
-- Effect: RPC blijft aanroepbaar; response bevat geen in_use meer.
-- Frontend moet gelijktijdig stoppen met branchen op in_use (zie SENSECORNER_FASE1A_SECURITY_VOORSTEL.md).

CREATE OR REPLACE FUNCTION public.onboarding_email_in_use(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  clean_email text;
BEGIN
  clean_email := lower(btrim(coalesce(p_email, '')));
  IF clean_email = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'empty_email');
  END IF;

  -- Geen lookup-resultaat naar de client: voorkomt enumeratie via PostgREST.
  RETURN jsonb_build_object('ok', true);
END;
$$;

COMMENT ON FUNCTION public.onboarding_email_in_use(text) IS
  'Fase1A: anti-enumeratie. Geeft geen in_use meer terug. Onboarding gebruikt post-OTP created_at voor password-stap.';
