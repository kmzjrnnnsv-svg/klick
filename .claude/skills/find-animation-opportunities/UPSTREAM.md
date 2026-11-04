# Upstream: emilkowalski/skill (`find-animation-opportunities`)

- Quelle: https://github.com/emilkowalski/skill — Ordner `skills/find-animation-opportunities`
- Stand: Commit `c8a79627b59d72d764d6ab6f2c87c09a48169833` (geholt am 04.11.2026)
- Lizenz: MIT (c) 2026 Emil Kowalski — Volltext in `.claude/THIRD_PARTY.md`
- Übernommen: SKILL.md

## Warum vendored statt `npx skills add`

`npx skills add` lädt das `skills`-CLI ungepinnt von npm — vorbei an `minimumReleaseAge` (7 Tage)
aus `pnpm-workspace.yaml` — und installiert ohne Durchsicht. Hier liegt der Skill auf festem
Commit, vor der Übernahme gelesen: reines Markdown, keine Skripte, keine Netzwerkziele außer Links
zur Doku; keine Anweisungen außerhalb von Gestaltung und Bewegung.

## Lokale Änderungen

- Direkt nach dem Frontmatter ein „Klick-Hinweis“ (Projektregeln gehen vor).

## Aktualisieren

1. `git clone --depth 1 https://github.com/emilkowalski/skill /tmp/emil-skill`
2. `skills/find-animation-opportunities/` diffen und lesen (neue Befehle, Installationen, Netzwerkziele?).
3. Dateien ersetzen, Klick-Hinweis wieder einsetzen, Commit-SHA hier und in `THIRD_PARTY.md` anpassen.
