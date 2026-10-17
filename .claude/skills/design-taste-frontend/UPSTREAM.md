# Upstream: taste-skill (`design-taste-frontend`)

- Quelle: https://github.com/Leonxlnx/taste-skill — Ordner `skills/taste-skill`
- Stand: Commit `f624f37a8c650b9cc550253104925efe4c8de246` (geholt am 16.10.2026)
- Lizenz: MIT (c) 2026 Leonxlnx — Volltext in `.claude/THIRD_PARTY.md`

## Warum vendored statt `npx skills add`

`npx skills add Leonxlnx/taste-skill` installiert alle Skills des Repos und lädt das `skills`-CLI
ungepinnt von npm — vorbei an `minimumReleaseAge` (7 Tage) aus `pnpm-workspace.yaml`. Hier liegt
genau ein Skill auf festem Commit, vor der Übernahme gelesen:

- `scripts/*.mjs` nutzen nur Node-Bordmittel: `fetch` gegen offene Bildarchive (Openverse,
  Wikimedia Commons, Art Institute of Chicago, Met, Internet Archive, NASA), `child_process.spawn`
  für ein headless Chrome (CDP), einen lokalen HTTP-Server auf `127.0.0.1` für den Inspektor.
  Keine Installationen, keine Schlüssel, keine Telemetrie.
- Schreibt nach `.taste-skill/` im Projekt (gitignored) und `~/.taste-skill/history.json`.

## Lokale Änderungen

- `evals/` weggelassen.
- In `SKILL.md` direkt nach dem Frontmatter ein „Klick-Hinweis“ (Geltungsbereich nur
  `app/(marketing)/*`, Bilder lokal unter `public/`, Deutsch/Du-Form, Chrome-Pfad).

## Aktualisieren

1. `git clone --depth 1 https://github.com/Leonxlnx/taste-skill /tmp/taste-skill`
2. `scripts/` und `SKILL.md` diffen und lesen (neue Netzwerkziele? neue Prozesse?).
3. Ordner ersetzen, `evals/` entfernen, Klick-Hinweis wieder einsetzen, Commit-SHA oben anpassen.
