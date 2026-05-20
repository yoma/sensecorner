# SenseCorner (DS-Project)

Statische webapps voor GitHub Pages. HTML-pagina's staan bewust in de **hoofdmap** (vlakke URLs zoals `datesense.html`).

## Hoofdmap (deploy)

| Bestand | Doel |
|---------|------|
| `index.html` | Landingspagina, inloggen/afmelden |
| `sensecorner.html` | Hub |
| `datesense.html`, `familysense.html`, `friendsense.html`, `selfsense.html`, `ownsense.html` | Sense-apps |
| `onboarding.html`, `admin.html` | Onboarding en beheer |
| `privacy.html`, `voorwaarden.html`, `ai-disclaimer.html` | Juridisch |

## Mappen

| Map | Inhoud |
|-----|--------|
| `js/` | Gedeelde scripts (`sense-auth-client.js`, `senseiCore.js`, feedback-widget, …) |
| `css/` | Gedeeld thema |
| `assets/` | Logo's en statische media |
| `edge-functions/` | Broncode Supabase Edge Functions (deploy apart) |
| `migrations/` | SQL-migraties (Supabase) |
| `sql/` | Losse SQL-checks en queries |
| `scripts/` | PowerShell/batch hulpscripts (niet voor productie-deploy) |
| `templates/` | UI-shell sjabloon voor parity-checks |
| `docs/` | Briefings, prompts, specificaties |
| `design/` | Mockups en designreferenties |
| `archive/` | Oude versies |

## Handige scripts

- `scripts/check-shell-parity.ps1` - vergelijkt app-shell met `templates/ui-shell-template.html`
- `scripts/tmp-get-date.bat` - timestamp voor DateSense build-tag (zie `.cursor/rules`)

## Deploy

Alleen bestanden uit de hoofdmap + `js/`, `css/`, `assets/` horen op GitHub Pages. `docs/`, `migrations/`, `scripts/`, `edge-functions/` worden niet als site geserveerd.
