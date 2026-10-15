# SenseCorner – Fase 1A security-voorstellen (niet uitgevoerd)

**Datum:** 15 oktober 2026  
**Uitgevoerd in deze ronde:** alleen Git-commit quotes (zie onder).  
**Niet uitgevoerd:** Auth Dashboard, SQL, frontend security-patches, push, deploy.

---

## Git-anker (uitgevoerd)

| Item | Waarde |
|---|---|
| Branch | `gateway-hub-migrate` |
| **Nieuwe commit** | `3ada765c7b15ec2c6c549cda8b16b0d82067cb05` |
| Bericht | Verbeter hub- en OWN-quotes met geschiedenis en minder herhaling. |
| Bestanden | alleen `ownsense.html`, `sensecorner.html` |
| **Herstelpunt (vorige HEAD)** | `d9b6f6548409fccfb8fc623ab9cdf3bf549fc192` |
| Push / deploy | **niet** gedaan |

Rollback feature-commit (lokaal, indien nodig):

```bash
git revert 3ada765c7b15ec2c6c549cda8b16b0d82067cb05
# of:
git checkout d9b6f6548409fccfb8fc623ab9cdf3bf549fc192 -- ownsense.html sensecorner.html
```

---

## 1. Wachtwoordbeleid → minimum 8 (voorstel)

### 1.1 Huidige Auth-instellingen (controle)

| Bron | Resultaat |
|---|---|
| Supabase MCP / SQL | **Geen veilige read** van Auth password-minimum in deze ronde (geen Auth Admin API in beschikbare tools; SQL tegen prod vermeden). |
| Client-code | Overal **6** tekens afgedwongen / gecommuniceerd. |
| Supabase docs | Aanbevolen minimum **≥ 8**. |

**Handmatige Dashboard-check (jij):**  
Authentication → Providers → Email → **Minimum password length** (of Password security). Noteer huidige waarde (waarschijnlijk 6).

### 1.2 Effect op bestaande users (belangrijk)

Volgens [Supabase password security docs](https://supabase.com/docs/guides/auth/password-security):

- Bestaande users kunnen **blijven inloggen** met hun huidige wachtwoord, ook als dat korter is dan het nieuwe minimum.
- Strengere eisen gelden voor **nieuwe** wachtwoorden (registratie, reset, `updateUser` password).
- Docs noemen ook een mogelijke `WeakPasswordError` bij zwakke wachtwoorden: **vóór productie-wijziging** even testen met een testaccount (login + reset).

**Conclusie:** minimum 8 in Auth sluit bestaande accounts niet automatisch buiten bij login, mits we geen extra client-gate op login zetten die korte wachtwoorden weigert.

### 1.3 Voorgestelde volgorde (KISS, veilig)

1. Dashboard: minimum length → **8** (na jouw OK).  
2. Lokaal: clientvalidatie + copy syncen naar 8 (**niet** op login-veld afdwingen als “min. 8” voor bestaande wachtwoorden; wel op **nieuw** wachtwoord: register/onboarding/reset).  
3. Smoke: nieuw testaccount ≥8; bestaand testaccount met oud wachtwoord kan nog inloggen.

### 1.4 Voorbereide client-aanpassingen (nog niet toegepast)

Alleen plekken die **nieuw wachtwoord** valideren / communiceren:

| Bestand | Wat wijzigen |
|---|---|
| `onboarding.html` | placeholder “min. 8”; `obPasswordFormOk` `>= 8`; fouttekst “minstens 8” |
| `datesense.html` / `familysense.html` / `friendsense.html` / `selfsense.html` | `doRegister` check `p.length<8` + register-placeholder “min. 6 tekens” → 8 |
| `sensecorner.html` / `index.html` | Placeholders: login mag “Wachtwoord” blijven of “min. 8 bij nieuw account”; vermijd “min. 8” op pure login als dat gebruikers met oude pw verwart |

**Niet wijzigen:** toevallige `length<6` / `length>=6` die over **tekst/quotes/anchors** gaan (geen wachtwoord).

**Optioneel lokaal:** in `js/sense-auth-client.js` `senseMapAuthError` uitbreiden voor weak-password / leaked-password messages (NL).

### 1.5 Dashboard-actie (wachtwoord min.)

1. Supabase Dashboard → Project `ghuqjtdrkwssyqvcubcd` → **Authentication** → **Sign In / Providers** (Email) of **Password**.  
2. Zet **Minimum password length** op `8`.  
3. Save.  
4. Rollback: terugzetten naar vorige waarde (noteer die eerst).

---

## 2. Leaked Password Protection / HIBP (voorstel)

### 2.1 Beschikbaarheid

| Check | Resultaat |
|---|---|
| Advisor | Nog steeds: **Leaked Password Protection Disabled** |
| Docs | Feature gebruikt HaveIBeenPwned Pwned Passwords API |
| **Plan-vereiste** | Docs: **“Leaked password protection is available on the Pro Plan and above.”** |

Als het project op **Free** staat, is de toggle mogelijk niet beschikbaar of niet actief. Eerst plan bevestigen in Dashboard → Organization/Project billing.

### 2.2 Gevolgen bestaande accounts

- Login met bestaand (ook gelekt) wachtwoord: doorgaans **blijft werken**; check bij wijziging/reset/nieuw.  
- Registratie / nieuw wachtwoord met gelekt wachtwoord → Auth weigert.  
- Foutmelding: typisch Engelse Auth-error; client toont nu vaak raw `message` via `senseMapAuthError` fallback → **aanbevolen** NL-mapping toe te voegen bij implementatie.

Voorbeeld mapping (voorstel, niet toegepast):

```js
if (low.indexOf('pwned') >= 0 || low.indexOf('leaked') >= 0 || low.indexOf('hibp') >= 0
    || code === 'weak_password') {
  return 'Dit wachtwoord is te zwak of bekend uit datalekken. Kies een langer, uniek wachtwoord.';
}
```

### 2.3 Concrete Dashboard-actie (na jouw OK + Pro-check)

1. Bevestig **Pro (of hoger)**.  
2. Authentication → **Password security** (of gelijkwaardig).  
3. Schakel **Prevent use of leaked passwords** / **Leaked password protection** **aan**.  
4. Save.  
5. Test met testaccount: registratie met bekend zwak wachtwoord (bijv. `password`) → geweigerd; sterke pw → OK; bestaand account login → OK.  
6. Rollback: toggle weer uit.

**Nog niet uitgevoerd.**

---

## 3. E-mailenumeratie – veilige oplossing (voorstel, niet uitgevoerd)

### 3.1 Probleem

`onboarding_email_in_use` + UI-tekst “Bestaande account gevonden…” laat anonieme callers weten of een bevestigd e-mailadres bestaat.

### 3.2 Doel-UX (eenvoudig voor nieuw én bestaand)

1. Gebruiker vult e-mail in.  
2. Neutrale tekst: *“We sturen een code naar dit adres als de aanvraag geldig is.”* (of korter: *“Check je mailbox voor een code.”*)  
3. OTP-flow blijft hetzelfde (`signInWithOtp` met `shouldCreateUser: true`).  
4. **Na** geslaagde OTP: wachtwoordstap alleen voor **nieuwe** accounts, niet geforceerd voor bestaande users die al een wachtwoord hebben.

### 3.3 Techniek zonder pre-check-leak (KISS)

**A. SQL** – klaargezet als pending file (niet toegepast):

`migrations/pending_fase1a_onboarding_email_in_use.sql`

Functie retourneert alleen `{ ok: true }` (of empty_email-fout); **geen** `in_use`.

**B. Frontend `onboarding.html`** (patch-voorstel, niet toegepast):

In `sendOtpAndGoToCode` (~3702–3717):

- RPC mag blijven (fail-open) of weg; **niet** branchen op `in_use`.  
- Geen “Bestaande account gevonden”.  
- Neutrale statusregel optioneel.  
- **Niet** meer: `obSetOtpSignupIntent(!existingActive, …)` op basis van enumeratie.

Vervang intent-logica door post-OTP:

```js
// Na succesvolle verifyOtpAndContinue, i.p.v. alleen obIsOtpSignupIntentForEmail:
function obUserLooksNewlyCreated(user) {
  var created = Date.parse(String((user && user.created_at) || "")) || 0;
  if (!created) return false;
  return (Date.now() - created) < 120000; // ~2 minuten
}

// Bij markeren password-stap:
if (obUserLooksNewlyCreated(u) || obLocalNeedsPassword(u.id) || obUserMetadataNeedsPassword(u)) {
  await obMarkSignupNeedsPassword(u.id, u);
}
```

`obRouteAfterEmailVerified` blijft bestaan; bestaande users met oud `created_at` slaan de dwangmatige password-stap over tenzij metadata/local flags dat vragen.

**C. Optioneel later:** RPC helemaal verwijderen uit client als hij niets meer doet.

### 3.4 Rollback

- SQL: oude `pg_get_functiondef` terugzetten (dump vóór migrate bewaren).  
- Frontend: `git checkout` van `onboarding.html`.

### 3.5 Wat we bewust niet doen in dit voorstel

- Geen `REVOKE` op anon (nog niet nodig als er geen leak meer is).  
- Geen breaking change aan OTP-typen.  
- Geen productiedata-wijziging.

---

## 4. RLS / CORS / CSP / domeinen

Geen wijzigingen. Geen nieuwe kritieke bevindingen buiten wat al in audit/plan stond (HIBP plan-gate hierboven is de enige scherpe aanvulling).

---

## 5. Goedkeuringen die nog nodig zijn

| # | Actie | Type | Blokkeert users? |
|---|---|---|---|
| A | Auth: minimum password length = 8 | Dashboard | Nee voor bestaande login (docs); wel voor nieuw/reset |
| B | Auth: Leaked password protection aan (als Pro) | Dashboard | Nee voor bestaande login; wel bij zwak nieuw pw |
| C | SQL pending migratie `onboarding_email_in_use` | Database | Nee (alleen response shape) |
| D | Frontend: onboarding anti-enumeratie + post-OTP password-stap | Lokaal code | UX-tekst wijzigt; flow blijft |
| E | Frontend: client min. 8 op register/onboarding (+ optioneel error mapping) | Lokaal code | Alleen nieuwe wachtwoorden |
| F | Deploy Pages na D/E | Hosting | Pas na smoke |

**Volgorde na OK:** A → E (of E parallel na A) → B → C+D samen → smoke → deploy.

---

## 6. Wat deze ronde wél / niet deed

| Wel | Niet |
|---|---|
| Quote-commit `3ada765` | Push |
| Security-voorstellen + pending SQL-file | Auth toggles |
| Herstelpunt bewaard | Database migrate |
| | Frontend security patches toepassen |
| | RLS/CORS/CSP/DNS |
)
