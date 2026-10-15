# SenseCorner – Fase 1A: onboardingcontrole + definitief security-voorstel

**Datum:** 15 oktober 2026  
**Status:** lokale frontend (wachtwoordvalidatie) geïmplementeerd; Auth/SQL/onboarding-anti-enumeratie **nog niet** op productie

---

## A. Resultaten onboardingcontrole (kritisch)

### A.1 Huidige flow (code)

1. E-mail → RPC `onboarding_email_in_use` → bij `in_use` UI “Bestaande account gevonden…” + `obSetOtpSignupIntent(false)`.  
2. Anders `obSetOtpSignupIntent(true)`.  
3. `signInWithOtp({ shouldCreateUser: true })`.  
4. OTP verify `type: 'email'` (fallback `signup`).  
5. Als signup-intent: `obMarkSignupNeedsPassword` → wachtwoordstap via `updateUser({ password })`.

### A.2 Waarom `created_at` als enige bewijs **afgewezen** is

| Risico | Uitleg |
|---|---|
| Valse “nieuw” | Klok/skew, hergebruikte rijen, race: bestaand account kan net opnieuw getouchd zijn |
| Valse “bestaand” | Soft-fail: nieuw account zonder betrouwbare `created_at` slaat wachtwoordstap over |
| Geen Auth-contract | Officiële docs koppelen OTP-flows niet aan client-side `created_at`-heuristieken |
| Overname/UX | Verkeerde branch kan bestaande users dwingen tot `updateUser({password})` (wachtwoord overschrijven) of nieuwe users zonder wachtwoord laten doorlopen |

**Conclusie:** `created_at`-heuristiek mag **niet** de enige of primaire beslisser zijn. Eerdere voorstel op dit punt is ingetrokken.

### A.3 Scenario’s (docs + code-analyse; geen productiedata geraakt)

| Scenario | Verwacht veilig gedrag | Enumeratie? | Opmerkingen |
|---|---|---|---|
| Nieuwe gebruiker | OTP → wachtwoord ≥8 zetten → verder | Nee (na fix) | Signup-intent of “geen password_done / needs_password” |
| Bestaand bevestigd | OTP → **niet** verplicht nieuw wachtwoord; wel door | Nee (na fix) | Skip via metadata/local done **of** expliciete “Ik heb al een wachtwoord” |
| Bestaand onbevestigd | Huidige RPC telt die **niet** als `in_use` → behandeld als signup | Nu: geen leak via die path | Na fix: zelfde neutrale OTP-pad |
| Verlopen/ongeldige OTP | Bestaande foutteksten blijven | Nee | Geen change nodig |
| Wachtwoordherstel | `resetPasswordForEmail` + nieuw pw ≥8 (client + later Auth) | Reset-mail is generiek bij Supabase | Los van onboarding-RPC |
| Bestaand pw &lt; 8 tekens | Login mag blijven werken tot Auth-beleid getest is | N/A | Zie sectie B |

### A.4 Definitieve anti-enumeratie-aanpak (minimaal, KISS) — **nog niet activeren**

**Doelen:** geen anonieme `in_use`-leak; eenvoudige UX; geen accountverlies; geen stille password-overwrite.

1. **SQL (pending, niet uitvoeren):** RPC geeft geen `in_use` meer (`migrations/pending_fase1a_onboarding_email_in_use.sql`).  
2. **Frontend onboarding (nog niet committen/activeren tot OK):**
   - Geen UI-branch op `in_use`; neutrale copy: *“We sturen een code naar dit adres.”*
   - RPC-aanroep mag weg of blijven als no-op fail-open.
   - **Niet** `obSetOtpSignupIntent` vullen vanuit e-mailcheck.
   - Na geslaagde OTP:
     - Als `obIsPasswordDone(uid)` of géén `onboarding_needs_password` **én** user kiest “Ik heb al een wachtwoord” → door zonder `updateUser({password})`.
     - Anders → wachtwoordstap (≥8), daarna `obMarkPasswordDone`.
   - Primair pad voor echt nieuwe users: wachtwoordstap tonen (default), met duidelijke skip alleen voor wie al een wachtwoord heeft.

Dit vermijdt enumeratie **en** vermijdt heuristische `created_at`-fouten.

### A.5 Accountovername / toegang

| Dreiging | Mitigatie in voorstel |
|---|---|
| Enumeratie e-mail | Geen `in_use` naar anon |
| OTP zonder mailbox | Ongewijzigd: OTP blijft bewijs van mailbox-controle |
| Ongewenste password overwrite | Geen auto-`updateUser` voor “bestaand”; skip-optie |
| Verlies toegang korte pw | Geen client-blokkade op **login**; Auth-min/HIBP pas na test |

---

## B. Compatibiliteitsrisico’s wachtwoordbeleid

### B.1 Wat we wél weten (officiële docs)

Bronnen: [Password security](https://supabase.com/docs/guides/auth/password-security), [Error codes](https://supabase.com/docs/guides/auth/debugging/error-codes), AuthWeakPasswordError.

- Aanbevolen minimum: **≥ 8**.  
- HIBP / leaked passwords: **Pro plan of hoger**.  
- Advisor op dit project: **Leaked Password Protection Disabled**.  
- Auth **minimum length** is **niet** via beschikbare MCP uitgelezen → **handmatige Dashboard-controle verplicht**.

### B.2 WeakPasswordError vs login (broncode-check GoTrue + auth-js)

Ambiguïteit in de FAQ is opgelost via server/clientbron:

| Pad | Gedrag |
|---|---|
| **Login** (`/token?grant_type=password`) | Geldig wachtwoord → **HTTP 200 + sessie**. Als pw onder beleid valt: veld `weak_password` / client `data.weakPassword` (reasons: `length`/`characters`/`pwned`). **`error` blijft `null`**. Geen accountblokkade. |
| **Signup / `updateUser({password})`** | Zwak pw → harde `AuthWeakPasswordError` (`code: weak_password`), geen sessie/update. |

Onze UI:

- **Geen** client min-8 op enig loginformulier (`index`, `sensecorner`, Date/Family/Friend/SelfSense).  
- Bij hard `weak_password` op login (verdedigend, zou niet moeten): NL-tekst met «Wachtwoord vergeten?» + data blijft bewaard (`context:'login'`).  
- Bij soft `data.weakPassword` na geslaagde login: tip via `senseWeakPasswordLoginNudge` (sessie blijft).  
- Min-8 alleen op register / onboarding / nieuw wachtwoord zetten.

**Nog steeds vóór Auth Dashboard min=8:** live test met bestaand testaccount + kort wachtwoord (T1). Auth-instellingen blijven uit tot die test groen is.

| Wijziging | Risico bestaande users | Mitigatie |
|---|---|---|
| Client min. 8 (alleen nieuw pw) | Laag | **Nu lokaal gedaan**; login niet geblokkeerd |
| Auth min. length 8 | Volgens GoTrue: login blijft werken + soft `weakPassword` | Eerst T1-testen; rollback toggle |
| HIBP aan (Pro) | Soft `pwned` op login; blokkeert gelekte **nieuwe** pw | Pro-check; test signup met `password` |

### B.3 Aanbevolen productievolgorde (na jouw OK + tests)

1. Dashboard: noteer huidige min length.  
2. Testuser A: wachtwoord **6 tekens** (bestaand of bewust gezet vóór Auth-change).  
3. Zet Auth min → 8; test login Testuser A.  
4. Als login faalt → **direct terugzetten**; alleen client-beleid houden tot Supabase-gedrag clar.  
5. Als login OK → HIBP aan (indien Pro); test zwak nieuw wachtwoord geweigerd.  
6. Daarna pas SQL + onboarding-anti-enumeratie.

---

## C. Wat lokaal al geïmplementeerd is (deze ronde)

| Bestand | Wijziging |
|---|---|
| `js/sense-auth-client.js` | Min-8 helpers; `senseMapAuthError({context})`; `senseSignInWeakPassword` + login-nudge |
| `onboarding.html` | Nieuw-wachtwoord validatie/placeholder → 8 |
| `index.html`, `sensecorner.html` | Register ≥8; **login zonder lengtecheck**; soft weak-nudge; login-foutmapping |
| `datesense/family/friend/selfsense.html` | Script `sense-auth-client.js`; `doRegister` ≥8; `doLogin` geen min-8; soft nudge |

**Niet gedaan:** push, deploy, Auth Dashboard, SQL, onboarding-enumeratie-logica, live T1 met kort-wachtwoord-testaccount.

**Let op:** `sense-auth-client.js` wordt nu ook geladen in Date/Family/Friend/SelfSense. Fallback `p.length>=8` blijft alleen in **register**-checks.

---

## D. Definitief minimaal implementatievoorstel (rest)

### D.1 Productie Auth (Dashboard) — wacht op OK + testplan groen

1. Controleer plan (Free vs Pro) voor HIBP.  
2. Noteer huidige password minimum.  
3. Na succesvolle login-test met korte-pw user: min → **8**.  
4. Indien Pro: enable **Leaked password protection**.  
5. Rollback: vorige waarden terugzetten.

### D.2 SQL — wacht op OK

Bestand: `migrations/pending_fase1a_onboarding_email_in_use.sql`  
Vooraf: dump `pg_get_functiondef`. Niet uitvoeren zonder OK.

### D.3 Onboarding frontend — wacht op OK (aparte kleine patch)

Zoals A.4: neutrale copy, geen `in_use`-branch, password-stap met skip “Ik heb al een wachtwoord”, géén `created_at`-only.

### D.4 Testplan (testaccounts only)

**T0 – Baseline (nu, met lokale client-wijzigingen, zonder Auth-change)**

- [ ] Login bestaand account (ook &lt;8 als die bestaat).  
- [ ] Register/onboarding nieuw pw met 7 tekens → client weigert.  
- [ ] Register/onboarding met 8+ tekens → OK (tot e-mailconfirm).  
- [ ] Foutmapping: forceer weak/pwned indien Auth al strikt is.

**T1 – Na Auth min 8 (staging of voorzichtig prod met testuser)**

- [ ] Login testuser met **6-teken** pw → must succeed of rollback.  
- [ ] Sign-up met 6 tekens → server weigert.  
- [ ] Reset → nieuw pw &lt;8 weigert; ≥8 OK.

**T2 – Na HIBP**

- [ ] Sign-up met bekend gelekt pw → weigert + NL-fout.  
- [ ] Login bestaand → OK.

**T3 – Na SQL + onboarding-patch**

- [ ] Nieuw e-mail: neutrale tekst, OTP, wachtwoordstap.  
- [ ] Bestaand bevestigd: OTP, skip of “al wachtwoord”, geen “account gevonden”.  
- [ ] Ongeldige OTP: bestaande fouten.  
- [ ] Anon mag via REST geen bruikbare `in_use` meer zien.

### D.5 Rollback

| Laag | Actie |
|---|---|
| Git (deze client-patch) | `git checkout --` / revert van de password-commit zodra die bestaat |
| Auth Dashboard | Min length / HIBP terug |
| SQL | Oude functiondef terug |
| Onboarding | Revert HTML-patch |

---

## E. Goedkeuringen gevraagd

Gelieve apart te bevestigen:

1. **Commit** van de lokale password-frontendwijzigingen (geen push)?  
2. Mag ik **Dashboard** Auth min=8 aanzetten **nadat** jij (of ik met testaccount-credentials die jij geeft) T1-login met korte-pw hebt groen?  
3. Mag HIBP aan **als** Pro beschikbaar is?  
4. Mag daarna SQL pending + onboarding-anti-enumeratie-patch (nog steeds geen deploy tot smoke)?  

Tot die OK’s: geen verdere productie-Auth/SQL/onboarding-activatie.
)
