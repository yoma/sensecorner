# Scripts

Hulpmiddelen voor ontwikkeling en onderhoud. Niet nodig op GitHub Pages.

| Script | Gebruik |
|--------|---------|
| `check-shell-parity.ps1` | Shell-CSS parity tussen apps en `templates/ui-shell-template.html` |
| `new-dossier-hidden-collision.test.mjs` | Weigert create-by-name als de naam al een verborgen ander-app dossier is |
| `tmp-get-date.bat` | Schrijft build-timestamp naar `tmp-build-out.txt` (optioneel) |
| `archive/` | Eenmalige migratie-/kopieerscripts (bewaard, niet dagelijks) |

Vanaf de projectroot:

```powershell
.\scripts\check-shell-parity.ps1
```
