# SenseCorner – Fase 1A: Veilige voorbereiding en security hardening

**Datum:** 15 oktober 2026  
**Status:** voorbereiding klaar – wacht op expliciete goedkeuring per stap  
**Scope:** Git veiligstellen, smoke-basis, concrete security-oplossingen (nog niet uitgevoerd op Auth/DB/productie)

---

## Stap 1 – Veiligstellen huidige situatie

### 1.1 Actuele Git-status (herverifieerd)

| Item | Waarde |
|---|---|
| Branch | `gateway-hub-migrate` (synced met `origin/gateway-hub-migrate`) |
| **Herstelpunt (HEAD)** | `d9b6f6548409fccfb8fc623ab9cdf3bf549fc192` |
| Laatste commit | *Zet thinking uit op Sonnet 5 en Opus 5…* |
| Modified (niet gestaged) | `ownsense.html`, `sensecorner.html` (+245 / −38) |
| Untracked (niet meenemen in quote-commit) | `SENSECORNER_AUDIT.md`, `SENSECORNER_FASE1_PLAN.md`, `SENSECORNER_FASE1A.md`, `FASE-0-AI-ROUTER-INVENTARIS.md`, `.cursor/`, `.claude/`, `.DS_Store` |

### 1.2 Inhoud van de open wijzigingen (behouden)

Alleen quote-/hub-logica, geen security:

- **ownsense.html:** `profile_quote_author/date/recent`, sync uit meta, betere quote-selectie (daypart, blocked set).
- **sensecorner.html:** hub-quotes onafhankelijk van 1-op-1 Own Sense-kopie; dag-pick + scoring t.o.v. profieltekst; build-meta bump.

Deze wijzigingen blijven intact zolang we ze committen of stashen (niet `git restore` / hard reset).

### 1.3 Voorstel: aparte feature-commit (nog niet uitgevoerd)

**Alleen deze twee bestanden:**

```bash
git add ownsense.html sensecorner.html
git commit -m "$(cat <<'EOF'
Verbeter hub- en OWN-quotes met geschiedenis en minder herhaling.

SenseCorner kiest quotes zelfstandiger; Own Sense bewaart auteur, datum en recente quotes.
EOF
)"
```

**Niet toevoegen:** audit/plan-markdown, `.cursor`, `.claude`, `.DS_Store`.

**Alternatief stash (als je eerst security wilt zonder feature-commit):**

```bash
git stash push -m "pre-fase1a-quotes" -- ownsense.html sensecorner.html
# later: git stash pop
```

### 1.4 Rollbackprocedure

| Situatie | Actie |
|---|---|
| Na feature-commit, feature terugdraaien | `git revert <nieuwe-commit-hash>` of `git checkout d9b6f6548409fccfb8fc623ab9cdf3bf549fc192 -- ownsense.html sensecorner.html` |
| Stash terug | `git stash list` → `git stash pop` (of `apply`) |
| Werkdirectory per ongeluk gewist | Alleen recovery via stash/commit; **geen** `git reset --hard` zonder aparte OK |
| Verkeerde bestanden in commit | `git reset --soft HEAD~1` (alleen als commit lokaal en niet gepusht) – vraagt opnieuw OK |

**Destructieve commando’s (verboden zonder aparte opdracht):** `reset --hard`, `clean -fd`, `push --force`, amend van gepushte commits.

### 1.5 Toestemming gevraagd

**Ik heb nog niets gecommit of gestasht.**

Kies één:

1. **Commit** de quote-wijzigingen zoals hierboven voorgesteld.  
2. **Stash** ze onder `pre-fase1a-quotes`.  
3. **Laat staan** (working tree dirty) en ga door met alleen documentatie/smoke.

---

## Stap 2 – Minimale testbasis

### 2.1 Handmatige regressiechecklist (testaccount only)

Gebruik uitsluitend een **dedicated testaccount** en neutrale testdata. Raak geen echte gebruikersdossiers aan.

**Omgeving:** `https://sensecorner.com` (canoniek). Noteer datum/tijd en of je op pre- of post-security zit.

#### A. Registratie / onboarding

- [ ] Open `onboarding.html` (of “Start gratis”).
- [ ] Nieuw test-e-mailadres → OTP/code-flow start zonder crash.
- [ ] Wachtwoord zetten (≥ huidig minimum) → door naar volgende stappen.
- [ ] Bestáánd test-e-mail: flow blijft begrijpelijk (geen blanke fout).

#### B. Login / logout

- [ ] Login via landing → hub zichtbaar.
- [ ] Hard refresh hub → sessie blijft (of nette herlogin).
- [ ] Logout → landing; opnieuw openen van hub/app vraagt login.

#### C. Navigatie hub ↔ Sense-apps

- [ ] Hub → DateSense (of één app) → pagina laadt.
- [ ] Terug naar hub.
- [ ] Hub → OWN Sense → terug.

#### D. Vertel-gesprekken

- [ ] In Sense-app: Vertel → kort neutraal bericht (“Smoke test, negeer.”).
- [ ] Antwoord of nette fout (geen JS white-screen).

#### E. OWN Sense profielopslag

- [ ] Eén onschuldig veld wijzigen → opslaan.
- [ ] Herladen → waarde aanwezig.

#### F. Dossiers

- [ ] Bestaand testdossier openen **of** nieuw dossier met neutrale naam.
- [ ] Na herladen nog zichtbaar.

#### G. Wachtwoordherstel

- [ ] “Wachtwoord vergeten” met test-e-mail → mail/richting zonder crash.
- [ ] (Optioneel) resetlink op testaccount afronden → opnieuw inloggen.

**Baseline vóór security:** checklist eenmaal groen markeren en datum noteren.

### 2.2 Geautomatiseerde smoke (publiek, veilig)

Toegevoegd: `scripts/smoke-public.sh`

- Controleert dat publieke pagina’s HTTP 200 geven en verwachte titel-fragmenten bevatten.
- **Geen login, geen writes, geen RPC’s tegen user-data.**
- Geschikt als snelle “site staat nog overeind”-check na deploy.

```bash
./scripts/smoke-public.sh
# optioneel:
BASE_URL=https://sensecorner.com ./scripts/smoke-public.sh
```

**Let op:** vanuit sommige agent-/CI-sandboxes kan curl 403 op de CONNECT-tunnel geven terwijl de site in een normale browser wél laadt. Draai het script lokaal in je eigen terminal voor een betrouwbare baseline.

**Niet geautomatiseerd in 1A (bewust):** login, Vertel, dossiers – die vereisen secrets/testcredentials en raken Auth/AI. Blijven handmatig (sectie 2.1) tot je een testuser + Playwright later goedkeurt.

### 2.3 Scripts-README

Zie update in `scripts/README.md` voor het smoke-script.

---

## Stap 3 – Security hardening (concrete oplossingen, nog niet uitgevoerd)

Onderscheid:

| Type | Betekenis |
|---|---|
| **Lokaal (repo)** | HTML/JS-wijzigingen; review + commit; deploy pas na smoke |
| **Dashboard (Supabase Auth)** | Geen git; jij of agent met jouw OK in Dashboard |
| **Database (SQL)** | Migratie na OK; eerst function dump als rollback |
| **Niet in 1A** | CSP, CORS allowlist, DNS `.be`, grote refactor |

---

### 3.1 Wachtwoordbeleid (nu min. 6 tekens)

#### Vastgesteld

- Client: `pw.length >= 6` / `< 6` in o.a. `onboarding.html` (~3992–4024) en Sense-registerflows.
- UI-copy: “Wachtwoord (min. 6)”.
- Server Auth minimum: Dashboard (nog handmatig bevestigen); HIBP staat uit (apart punt).

#### Voorgestelde oplossing (UX behouden)

1. **Dashboard eerst:** Auth password minimum → **8** (aanbevolen; of 10 als je strenger wilt).  
2. **Daarna lokaal:** dezelfde drempel in copy + validatie op alle register/onboarding-paden, zodat fouten niet “server zegt X / UI zegt Y” worden.

**Bestanden (lokaal, na Dashboard-OK):**

- `onboarding.html` (placeholder, `obPasswordFormOk`, `savePasswordAndContinue`)
- `sensecorner.html`, `index.html` (placeholders login/register waar van toepassing)
- Register-templates in `datesense.html`, `familysense.html`, `friendsense.html`, `selfsense.html`

**Effect bestaande accounts:** blijven inloggen met oude (eventueel 6-teken) wachtwoorden tot zij resetten/wijzigen.  
**Effect onboarding:** nieuwe users moeten ≥8.  
**Effect password reset:** nieuw wachtwoord moet aan nieuw minimum voldoen.  
**Rollback:** Dashboard min terug naar 6; `git revert` client-commit.

#### Lokaal vs Dashboard

| Stap | Waar |
|---|---|
| Minimum verhogen (afdwingen) | **Dashboard** |
| Copy + client checks syncen | **Lokaal** |

---

### 3.2 Supabase Leaked Password Protection (HIBP)

#### Vastgesteld

Security advisor: `auth_leaked_password_protection` = disabled.

#### Voorgestelde oplossing

In Supabase Dashboard → Authentication → Providers/Passwords (Password security):

- **Enable leaked password protection**

Geen repocode nodig.

**Effect bestaande accounts:** login met bestaand (ook gelekt) wachtwoord blijft meestal werken; bij **wijzigen/reset/nieuw** weigert Auth bekende gelekte wachtwoorden.  
**Effect onboarding:** registratie met `password123` e.d. faalt met Auth-fout – client toont idealiter de bestaande NL-foutmapping (`senseMapAuthError` / generieke melding).  
**Effect password reset:** sterker wachtwoord verplicht als het oude gelekt was.  
**Rollback:** toggle uit in Dashboard (seconden).

#### Lokaal vs Dashboard

| Stap | Waar |
|---|---|
| HIBP aan | **Dashboard only** |
| Eventueel duidelijkere fouttekst bij “leaked password” | **Lokaal** (optioneel, kleine UX) |

---

### 3.3 E-mailenumeratie via `onboarding_email_in_use`

#### Vastgesteld

- SQL: retourneert `{ ok, in_use }` op basis van bevestigde `auth.users`.
- `anon` mag `EXECUTE`.
- `onboarding.html` ~3704–3712: bij `in_use` toont “Bestaande account gevonden…”.

#### Voorgestelde oplossing (UX zo veel mogelijk behouden)

**Doelgedrag voor de user:**

- Nieuw adres → code/OTP zoals nu.  
- Bestaand adres → ook code/OTP (inloggen via code), **zonder** harde bevestiging “dit e-mail bestaat” aan anonieme callers.

**Techniek (KISS):**

1. **Database:** functie aanpassen zodat response **geen bruikbare `in_use`-boolean** meer lekt, bijv. altijd `{ "ok": true }` (of gelijke shape met `in_use` weggelaten).  
2. **Lokaal:** onboarding faalt open / behandelt alle cases als “we sturen een code”; copy neutraal: *“Als dit e-mailadres bij ons bekend is, ontvang je een code.”* (klassiek anti-enumeratiepatroon).  
3. **Optioneel later:** rate limiting; `REVOKE` is hier minder nodig als de functie geen secret meer lekt.

**Behoud UX:** terugkerende users krijgen nog steeds OTP en kunnen door; alleen de vroege “account gevonden”-hint verdwijnt (bewuste trade-off privacy vs. hint).

**Effect bestaande accounts:** geen data-wijziging.  
**Effect onboarding:** iets generiekere copy; OTP-pad blijft.  
**Effect password reset:** ongewijzigd (ander Auth-pad).  
**Rollback:** oude `pg_get_functiondef` terugzetten + HTML revert.

#### Lokaal vs Database

| Stap | Waar |
|---|---|
| Functie harden | **Database (SQL migratie)** – alleen na OK |
| Onboarding copy/flow | **Lokaal** `onboarding.html` |
| REVOKE anon (optioneel) | **Database** – alleen als client RPC niet meer nodig is |

#### Voorbeeld SQL (nog niet uitgevoerd – ter review)

```sql
-- ROLLBACK: bewaar vooraf output van pg_get_functiondef('onboarding_email_in_use')

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
  -- Geen in_use meer: voorkomt enumeratie via PostgREST.
  -- Optioneel: hier later rate-limit / logging.
  RETURN jsonb_build_object('ok', true);
END;
$$;
```

Client (`onboarding.html`): stop met lezen van `mailData.in_use` voor UI-branching; behoud fail-open bij RPC-fout.

---

## Aanbevolen volgorde ná jouw OK’s

```text
1. Stap 1: commit OF stash quote-wijzigingen
2. Handmatige smoke baseline (2.1) + ./scripts/smoke-public.sh
3. Dashboard: HIBP aan                    ← Auth OK
4. Dashboard: password min 8              ← Auth OK
5. Lokaal: client copy/checks → 8         ← code OK + smoke
6. Database: onboarding_email_in_use      ← SQL OK
7. Lokaal: onboarding neutrale copy       ← code OK + smoke
8. Smoke opnieuw (2.1 + script)
```

---

## Wat Fase 1A nu wél / niet heeft gedaan

| Gedaan | Niet gedaan |
|---|---|
| Herstelpunt gedocumenteerd | Commit/stash (wacht op OK) |
| Smoke-checklist + public smoke-script | Playwright met login |
| Concrete security-oplossingen + rollback | Auth/DB/productiewijzigingen |
| Onderscheid lokaal vs Dashboard vs SQL | Deploy |

---

## Beslispunten (antwoord a.u.b.)

| # | Vraag | Opties |
|---|---|---|
| 1 | Quote-diff `ownsense` + `sensecorner` | **commit** / **stash** / **laten staan** |
| 2 | HIBP aanzetten (Dashboard) | ja / nee / later |
| 3 | Password minimum | **8** / **10** / later |
| 4 | E-mail-RPC harden + onboarding-copy | ja / nee / later |
| 5 | Mag ik na OK meteen de **lokale** HTML-aanpassingen (min. lengte + onboarding-copy) voorbereiden in een branch, zonder deploy? | ja / nee |
)
