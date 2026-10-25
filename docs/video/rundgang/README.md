# Rundgang-Video für /funktionen

Quelle des Videos `public/funktionen/rundgang.{mp4,webm,jpg}` (24 s, ohne Ton). Komposition
für [HyperFrames](https://hyperframes.heygen.com) 0.8.158: HTML mit einer GSAP-Zeitleiste
(`index.html`), gerendert zu MP4.

## Neu bauen

Nichts davon läuft im Projekt selbst; alles in einem eigenen Ordner außerhalb des Repos.

1. HyperFrames und GSAP abseits des Projekts installieren, ohne Lifecycle-Skripte und mit
   7 Tagen Cooldown:
   `pnpm add hyperframes@0.8.158 gsap@3.13.0 --ignore-scripts --config.minimum-release-age=10080`
2. Projektordner mit `index.html` aus diesem Verzeichnis und `assets/`:
   - `gsap.min.js` aus `node_modules/gsap/dist/`
   - `inter-{regular,medium,semibold,bold}.otf`: Inter (SIL OFL) nur zum Rendern als Ersatz für
     die Systemschrift, nicht für die Website (die liefert keinen Webfont aus)
   - `risiko.jpg`, `freigaben.jpg` aus `public/funktionen/`, `pruefungsreife.jpg` aus
     `public/leistungen/` (Beispieldaten)
   - `funktionen-seite.jpg`: Ganzseitenfoto von `/funktionen` (1440 px breit, Bilder geladen,
     oberste 5400 px)
   - Die drei Ansichten kommen aus `scripts/qa/marketing-shots.ts`; nach neuen Bildern Video neu bauen
3. Rendern (Telemetrie aus, Browser ohne Sandbox nur als root nötig):
   `HYPERFRAMES_NO_TELEMETRY=1 HYPERFRAMES_NO_UPDATE_CHECK=1 HYPERFRAMES_SKIP_SKILLS=1 npx hyperframes render -o rundgang.mp4`
4. Fürs Web:
   `ffmpeg -i rundgang.mp4 -vf scale=1280:720 -c:v libx264 -crf 25 -preset slow -movflags +faststart -an rundgang.mp4`,
   WebM mit `-c:v libvpx-vp9 -b:v 0 -crf 38`, Vorschaubild bei 3 s.

Texte im Video: Du-Form, keine Gedankenstriche, Ansichten aus Klick nur mit Beispieldaten.
Ändert sich die Seite stark, Video neu bauen.
