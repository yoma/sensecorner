# SenseCorner – Fase 2 Golf B plan

**Datum:** 15 oktober 2026  
**Status:** voorstel ter beoordeling – **geen code, geen push**  
**Context:** Golf A live op `main` (`c2b8ad8`): logo, cache/`?v=`, JSZip lazy, fonts.  
**Doel:** dagelijks gebruik merkbaar sneller, eenvoudiger en aangenamer laten aanvoelen.

**Grenzen (onverkort)**

- Geen nieuwe frameworks of dependencies.  
- Bestaande mogelijkheden en visuele identiteit behouden.  
- OWN Sense en Gateway **niet** automatisch verbergen.  
- Grote onboarding-/navigatiewijzigingen alleen als apart voorstel (zie §5).  
- Geen destructieve rollback; geen deploy in deze golf tot aparte OK.

---

## 1. Bevindingen (bestaande implementatie)

### 1.1 Wat al goed is

| Flow | Nu |
|---|---|
| Hub → Sense-app (app-cards) | `.loading` + “Openen…” + `data-sc-nav` (dubbele tik) vóór `location.href` |
| Vertel versturen | `S.busy`; typing-dots (`showT`) + hints na 9s/20s; clear in `finally` |
| Profiel/dossier opslaan | `setButtonSaveBusy` / sync-balk op meerdere paden |
| Hub-login | `authBusy` schakelt knoppen uit |
| Gateway-chat | `busy` **én** send-knop `disabled` (sterker patroon) |
| Gesprek openen | “Gesprek laden…” tijdens sessie-fetch |

### 1.2 Vertragingen: gemeten / vermoed / visueel

| Gebruikersmoment | Klasse | Toelichting |
|---|---|---|
| Hub → DateSense/SelfSense | **Gemeten** | Full-page nav; HTML ~860–980 KB raw / ~230–260 KB gzip (Golf A baseline). Card-spinner verkort de wait niet, wel de “dode” klik. |
| OWN/hero-links zonder `.loading` | **Visueel** | Zelfde netwerk-wait, minder feedback dan app-cards. |
| Mirror `never_opened`: fact-check vóór nav | **Gemeten + gat** | `scResetAppCardLoading()` dan `await mirrorHasOnboardingFacts` → korte stille wait mogelijk (`sensecorner.html` ~3391–3404). |
| Dossiercontext vóór AI (`buildDossierContextForAI`, timeout ≤12 s) | **Gemeten** | Netwerk/DB; typing-dots staan al aan. |
| AI-antwoord (`callAPI` 45 s / expertise 80 s) | **Gemeten** | Dominante wait; golf B verkort dit niet. |
| Vertel send klikbaar tijdens `S.busy` | **Vermoed + visueel** | Tweede tik wordt stil genegeerd; Gateway doet het beter. |
| OWN Vertel zonder busy-guard | **Vermoed (stabiliteit)** | Dubbele submit → dubbele fact-extract mogelijk. |
| Toast `white-space:nowrap` op smalle schermen | **Visueel** | Lange fout/status kan off-screen lopen. |

### 1.3 Mobile-first (spot-check)

- Safe-area, vaste topbar/nav/dossier-dock en dual-scroll (`#appScroll` / `#chatWrap`) zijn aanwezig.  
- Vertel-rondknoppen op smalle viewports ~38–42 px (krap t.o.v. 44 px-richtlijn).  
- Geen voorstel om layout/identiteit te herschrijven; alleen feedback en busy-states.

### 1.4 KISS (zonder OWN/Gateway te verbergen)

Zware stappen die **blijven** (bewust product): per-bericht opslagbalk, mirror-intake bij eerste open, start-intro (wegklikbaar).  
Golf B raakt die **niet** structureel; zie §5 voor een apart funnel-voorstel.

---

## 2. Maximaal 5 voorstellen (gerangschikt)

Scores 1–5 (hoger = gunstiger). Volgorde = aanbevolen uitvoer volgorde.

| # | Verbetering | Impact | Inspanning | Regressierisico | Type winst |
|---|---|---|---|---|---|
| **B1** | Vertel: send (+ mic-affordance) uitschakelen tijdens `S.busy`; korte toast bij herhaalde tik | 5 | 5 | 5 | Visueel + stabiliteit |
| **B2** | OWN Vertel: busy-flag + knop “Opslaan en verwerken” disable/restore | 5 | 5 | 5 | Stabiliteit (+ lichte feedback) |
| **B3** | Hub: zelfde “Openen…”-loading op OWN Sense-exits; loading **aanhouden** tijdens mirror first-open fact-check | 4 | 5 | 5 | Visueel (tegen gemeten nav-wait) |
| **B4** | Typing-substatus: “Context laden…” → “Sensei denkt na…” rond dossiercontext / `callAPI` | 4 | 4 | 4 | Visueel (tegen gemeten AI/DB-wait) |
| **B5** | Mobiele toast: wrap + max-width; vaste smoke + busy-spotcheck als deploy-gate | 3 | 5 | 5 | Visueel + proces |

**Niet in deze 5 (bewust):** HTML splitsen, soft-SPA, AI-latency, service worker, first-run funnel (apart §5).

---

## 3. Detail per voorstel

### B1 – Vertel send UI tijdens busy (Sense-apps)

- **Probleem:** `sendMsg` heeft `if(S.busy)return` maar de verstuur-UI blijft actief; tweede tik voelt “kapot”. Gateway zet wél `disabled`.  
- **Doen:** bij `S.busy=true` send-knop (+ eventueel mic) disable; aria-busy op input-bar; bij herhaalde Enter/tik één zachte toast (“Even geduld, Sensei is bezig…”). Zelfde patroon in Date/Friend/Family/SelfSense (gedeelde code-kopieën).  
- **Niet doen:** AI-timeouts of prompt-logica wijzigen.  
- **Meten:** handmatig dubbele tik tijdens typing-dots; geen lab-metric nodig.  
- **Risico:** laag (bestaande `finally`/`hideT` blijft clear-punt).

### B2 – OWN Vertel busy-guard

- **Probleem:** `submitOwnVertel` toont “Verwerken…” maar geen guard/`disabled` (`ownsense.html` ~3186–3202).  
- **Doen:** `_ownVertelBusy` (of hergebruik review-busy-patroon); knop disable; early return; altijd restore in `finally`.  
- **Meten:** snelle dubbele klik → één extractie.  
- **Risico:** laag.

### B3 – Hub loading feedback dichter maken

- **Probleem:** app-cards hebben loading; OWN-hero / `hubOpenOwnBtn` / sommige `data-app-link`-exits niet. Mirror `never_opened` reset loading vóór await.  
- **Doen:**  
  1. OWN-open paden dezelfde loading-chrome (tekst “OWN Sense openen…” of generieke “Openen…”).  
  2. Bij first-open: loading **niet** resetten vóór `mirrorHasOnboardingFacts`; pas resetten bij cancel/fout/modal.  
- **Meten:** screenshot/tik op OWN + first-open DateSense op 390px.  
- **Risico:** laag; let op bfcache/`pageshow`-reset (bestaat al voor cards).

### B4 – Duidelijkere AI-wachtstatus (zonder snellere AI)

- **Probleem:** dots staan al vóór dossiercontext + AI; gebruiker weet niet of er nog “opzoeken” of “nadenken” speelt.  
- **Doen:** onder de dots één regel wisselen: start “Context laden…”; net vóór `callAPI` “Sensei denkt na…”. Bestaande 9s/20s-hints behouden.  
- **Niet doen:** parallelle premature AI-calls of context overslaan.  
- **Meten:** subjectief + Network-timing correlatie (context vs completion).  
- **Risico:** laag–middel (alleen copy/DOM in typing-wrap; test Vertel in 1–2 apps).

### B5 – Toast leesbaar + stabiliteitsritueel

- **Probleem:** `.toast{white-space:nowrap}` (o.a. DateSense ~590) knipt lange meldingen op mobiel. Busy-guards bestaan, maar inconsistent.  
- **Doen:** toast wrap + `max-width: min(92vw, 360px)` in Sense-apps (zelfde look, cream/donkere toast behouden). Checklist vastleggen: login → hub → Sense → Vertel (dubbele send) → OWN Vertel (dubbele save) → logout; vóór elke Golf B-deploy.  
- **Meten:** lange toast-string op 390px; checklist afvinken.  
- **Risico:** zeer laag.

---

## 4. Aanbevolen volgorde & stop-criterium

1. B1 → B2 (stabiliteit + directe “klik-feedback”).  
2. B3 (hub-gevoel bij app-open).  
3. B4 (wacht tijdens Sensei).  
4. B5 (polish + gate).  

**Stop-criterium Golf B:** Vertel/OWN voelen responsief bij busy; hub-OWN/first-open tonen loading; geen regressie op login/Vertel/save; smoke-checklist groen.

**Deploy:** alleen na expliciete OK (zelfde discipline als Golf A).

---

## 5. Apart voorstel (niet in Golf B-uitvoering)

**First-run / hub-funnel vereenvoudigen** (was Fase2-plan #7): één duidelijk pad “kies spiegel → Vertel”, zonder OWN Sense of Gateway te verbergen – alleen progressive disclosure / copy voor nieuwe testers.  
Dat raakt productkeuzes en navigatie; **eerst aparte review**, niet meenemen in B1–B5.

---

## 6. Wat we bewust niet doen in Golf B

- HTML-extractie / shared core (hoog regressierisico).  
- Soft-SPA tussen hub en apps.  
- AI-latency of edge-proxy herschrijven.  
- Service worker / PWA (Golf C-kandidaat).  
- HIBP / e-mailenumeratie (geparkeerd).  
- Extra optimalisaties buiten B1–B5 zonder nieuwe OK.

---

## 7. Beslispunten voor jou

1. Akkoord op scope B1–B5 zoals gerangschikt?  
2. B4 (typing-substatus) meenemen of bewust overslaan (puur copy)?  
3. §5 first-run apart laten tot na Golf B?

Na jouw OK: eerst implementeren lokaal, meten/smoke, pas daarna deploy-voorstel.
