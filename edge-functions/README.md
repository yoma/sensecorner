# Edge Functions

Bronbestanden voor Supabase Edge Functions. Kopieer of deploy naar je Supabase-project (`functions/v1/...`).

| Bestand | Endpoint (voorbeeld) |
|---------|----------------------|
| `sensei-chat.edge.ts` | `/functions/v1/sensei-chat` |
| `whatsapp-webhook.edge.ts` | `/functions/v1/whatsapp-webhook` |

De apps roepen `sensei-chat` aan via `fetch`; WhatsApp gebruikt Twilio-webhook.
