# Scripts

Hulpmiddelen voor ontwikkeling en onderhoud. Niet nodig op GitHub Pages.

| Script | Gebruik |
|--------|---------|
| `smoke-public.sh` | Publieke HTTP-smoke (titels/200); geen login of user-data |
| `check-shell-parity.ps1` | Shell-CSS parity tussen apps en `templates/ui-shell-template.html` |
| `tmp-get-date.bat` | Schrijft build-timestamp naar `tmp-build-out.txt` (optioneel) |
| `archive/` | Eenmalige migratie-/kopieerscripts (bewaard, niet dagelijks) |

```bash
./scripts/smoke-public.sh
BASE_URL=https://sensecorner.com ./scripts/smoke-public.sh
```

**Handmatige regressie (incl. busy-guards Golf B):** zie `SENSECORNER_FASE1A.md` §2.1, checklist C–E (hub loading, Vertel send disabled, OWN Vertel busy).

Vanaf de projectroot:

```powershell
.\scripts\check-shell-parity.ps1
```
