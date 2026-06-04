# Edge Functions

Bronbestanden voor Supabase Edge Functions. Kopieer of deploy naar je Supabase-project (`functions/v1/...`).

| Bestand | Endpoint (voorbeeld) |
|---------|----------------------|
| `sensei-chat.edge.ts` | `/functions/v1/sensei-chat` |
| `selfsense-aandachtspunten-detect.edge.ts` | `/functions/v1/selfsense-aandachtspunten-detect` |
| `whatsapp-webhook.edge.ts` | `/functions/v1/whatsapp-webhook` |

De apps roepen `sensei-chat` aan via `fetch`; WhatsApp gebruikt Twilio-webhook.

### selfsense-aandachtspunten-detect (Fase 2)

Offline detectie van 0-3 voorgestelde aandachtspunten uit `selfsense_checkins` naar `own_aandachtspunten` (status `voorgesteld`, `tips_advice` leeg). Model: `claude-opus-4-6`. Minimaal 4 relevante check-ins (code + prompt).

**Triggers in de apps**

| Moment | Bestand |
|--------|---------|
| Na check-in in onboarding (intake self_5) | `onboarding.html` |
| Na dagelijkse check-in in SelfSense | `selfsense.html` (`saveCheckin`) |
| Na login/bootstrap (max 1× per 24 uur, alleen bij ≥4 check-ins) | `selfsense.html` (`scheduleBootstrapAandachtDetect`) |

Client helper: `js/selfsense-aandachtspunten-detect.js` (geladen in `selfsense.html` en `onboarding.html`).

#### Deploy-checklist (volgorde)

1. **Database:** migratie `migrations/20260604_own_aandachtspunten.sql` uitvoeren in Supabase SQL Editor (eenmalig, door beheerder).
2. **Edge Function:** vanuit de Supabase-projectmap met functions-config:
   ```bash
   supabase functions deploy selfsense-aandachtspunten-detect
   ```
3. **Secrets** (zelfde set als `sensei-chat`, Dashboard → Edge Functions → Secrets of CLI):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY`
4. **GitHub Pages / static hosting:** upload minstens:
   - `selfsense.html`
   - `ownsense.html`
   - `onboarding.html` (intake-check-in)
   - `js/selfsense-aandachtspunten-detect.js`
   - `css/sense-theme.css` (ongewijzigd tenzij je styling meeneemt)
5. **Controle:** ingelogde testuser met ≥4 check-ins → POST hieronder of dagelijkse check-in in SelfSense → rijen in `own_aandachtspunten` met `status = voorgesteld`.

Test (vervang URL en JWT):

```bash
curl -s -X POST "https://<project>.supabase.co/functions/v1/selfsense-aandachtspunten-detect" \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d "{}"
```
