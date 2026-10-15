# SenseCorner Fase 2 – Golf B resultaat

**Datum:** 15 oktober 2026  
**Branch:** lokaal (geen push / geen deploy)  
**Scope:** B1–B5 + AI-latency onderzoek (geen AI-/architectuurwijzigingen)

---

## 1. Uitgevoerde wijzigingen

| # | Wat | Bestanden (kern) |
|---|---|---|
| **B1** | Vertel send-knop `disabled` + `aria-busy` tijdens `S.busy`; herstel in `finally` / alle busy-paden; geen toast bij herhaalde tik | `js/sense-common.js`, Date/Friend/Family/SelfSense |
| **B2** | OWN Vertel: `__ownVertelBusy` + knop disable/label; mic/andere acties onaangeroerd | `ownsense.html` |
| **B3** | Hub loading op OWN-exits + mirror first-open; reset bij cancel/fout/login-redirect/bfcache | `sensecorner.html` |
| **B4** | Typing-fase alleen bij echte stappen: “Dossiercontext laden…” → “Sensei denkt na…” | Sense-apps + `senseSetTypingPhase` |
| **B5** | Toast wrap `max-width:min(92vw,360px)`; busy-checks in smoke-checklist | Sense-apps CSS; `SENSECORNER_FASE1A.md` §2.1; `scripts/README.md` |

Cache-bust gedeelde helper: `js/sense-common.js?v=20261015b` op de vier Sense-apps.

---

## 2. Tests (lokaal)

| Test | Resultaat |
|---|---|
| String-smoke: `vertelSendBtn`, `setVertelBusy`, typing-phases, toast wrap | Geslaagd |
| String-smoke: OWN `ownVertelSubmitBtn` / `setOwnVertelSubmitBusy` | Geslaagd |
| String-smoke: hub `scMarkElementNavLoading`, OWN-knop “openen…” | Geslaagd |
| Publieke `./scripts/smoke-public.sh` | Niet opnieuw tegen live (geen deploy); checklist bijgewerkt |
| Handmatige login/Vertel/OWN met testaccount | **Niet uitgevoerd** (geen credentials in sessie) |

---

## 3. AI-latency bevindingen (onderzoek only)

Zie apart overzicht in §4 hieronder; geen codewijzigingen aan prompts/modellen/proxy.

---

## 4. AI-latency – tijdsverdeling

### 4.1 Gemeten

| Bron | Observatie |
|---|---|
| Edge logs `sensei-chat` (24u-sample) | Eén recente `POST` **200** met `execution_time_ms ≈ 6440` (purpose log: `standard_task` → `claude-sonnet-5`). OPTIONS ≈ 123 ms. |
| `public.ai_telemetry` | Tabel bestaat; **0 rijen** in 30 dagen (client logt alleen non-`ok` / throttled). Geen p50/p95 uit productie-telemetrie. |

### 4.2 Uit code (timeouts / budgetten – geen live meting van gemiddelde)

| Stap | Waar | Budget / gedrag | Klasse |
|---|---|---|---|
| Frontend vóór AI (dossier match, history, sys-string) | `sendMsg` | Synchroon JS; meestal kort | **Vermoed** klein t.o.v. netwerk |
| `buildDossierContextForAI` (+ eventuele fallbacks) | o.a. `loadMsgs` limit 20, inner timeout 4 s; wrap **12 s** | Kan oplopen bij trage DB of meerdere fallbacks (elk tot 12 s) | **Vermoed** (code-pad); niet apart getimed in logs |
| Auth token voor Edge | `getAccessTokenFresh` in `callAPI` | Extra round-trip mogelijk | **Vermoed** |
| Edge `sensei-chat` | Auth, rate-limit counts, flags, optionele snapshots, roepnaam | DB vóór Anthropic | Deels in de **6.4 s** wall time hierboven |
| Anthropic-aanroep | Edge abort **40 s** (standard) / **75 s** (deep/expertise) | Dominant deel van lange waits | **Vermoed** als hoofdoorzaak van 10–40 s+; 6.4 s sample was sneller |
| Client `callAPI` abort | **45 s** Vertel standaard / **80 s** expertise | User ziet timeout pas na deze limiet | **Gemeten als limiet** (niet als mediane latency) |
| Opeenvolgende AI-calls | Import/WA-chunks/samenvatting/expertise | Meerdere `callAPI` achter elkaar | **Vermoed** bij die flows; Vertel standaard = **1** completion |
| Sessie opslaan na antwoord | `ensureActiveSession` + 2× `saveSessionMsg`, timeout **5 s** | Na `hideT` deels; blokkeert typing minder | **Vermoed** klein na UI-antwoord |

**Conclusie onderzoek:** “45–80 seconden” in de analyse zijn vooral **client abort-budgetten**, geen bewezen mediane latency. Een recente Edge-call was ~**6.4 s** end-to-end. Langere waits zijn plausibel bij Sonnet/Opus + grote system prompts + dossiercontext + eventuele web_search tools, maar dat is **niet** met p50 uit `ai_telemetry` bevestigd (leeg).

### 4.3 Mogelijke quick wins (niet uitgevoerd)

1. Client-telemetrie voor **succesvolle** Vertel-calls (fasen: context_ms, edge_ms) zonder inhoud te loggen.  
2. Edge: log duration breakdown (pre-Anthropic vs Anthropic) in server logs.  
3. Paralleliseren of verkorten van dossier-`loadMsgs` als context_ms structureel hoog blijkt.  
4. Prompt-caching flag / snapshot-pad meten (bestaat al, flags vaak uit).  

Geen van deze is in Golf B geïmplementeerd.

---

## 5. Bewust niet gedaan

- Push / GitHub Pages deploy  
- Prompt-, model- of antwoordkwaliteitwijzigingen  
- Auth / RLS / DB-schema  
- Nieuwe frameworks  
- First-run funnel (§5 Golf B-plan)

---

## 6. Volgende stap

Na review: toestemming voor deploy van Golf B-commits naar `main`.
