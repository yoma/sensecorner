# Scripts

Hulpmiddelen voor ontwikkeling en onderhoud. Niet nodig op GitHub Pages.

| Script | Gebruik |
|--------|---------|
| `check-shell-parity.ps1` | Shell-CSS parity tussen apps en `templates/ui-shell-template.html` |
| `new-dossier-hidden-collision.test.mjs` | Weigert create-by-name als de naam al een verborgen ander-app dossier is |
| `whatsapp-import-contact-index.test.mjs` | WhatsApp-import houdt contactindex tot na klik; lege naam is geen match |
| `friendsense-fs-scope-steal.test.mjs` | FriendSense mag FamilySense `fs`-dossiers niet naar `fr` converteren |
| `forced-dossier-cross-app.test.mjs` | Vertel "Altijd opslaan bij" blijft per app; geen stamp van fs/ds op een verborgen dossier |
| `ensurep-hydrate-before-create.test.mjs` | ensureP hydrates from DB before create; insert not upsert so other-app rows are not wiped |
| `tmp-get-date.bat` | Schrijft build-timestamp naar `tmp-build-out.txt` (optioneel) |
| `archive/` | Eenmalige migratie-/kopieerscripts (bewaard, niet dagelijks) |

Vanaf de projectroot:

```powershell
.\scripts\check-shell-parity.ps1
```
