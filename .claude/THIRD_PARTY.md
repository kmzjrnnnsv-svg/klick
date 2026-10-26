# Drittanbieter-Inhalte in `.claude/`

| Pfad | Quelle | Commit | Lizenz |
|---|---|---|---|
| `commands/web-interface-guidelines.md` | https://github.com/vercel-labs/web-interface-guidelines | `434b7f91364665f2f733b310ec54809bf8f37937` | MIT |
| `skills/design-taste-frontend/` | https://github.com/Leonxlnx/taste-skill (`skills/taste-skill`) | `f624f37a8c650b9cc550253104925efe4c8de246` | MIT |
| `skills/owasp-security/` | https://github.com/agamm/claude-code-owasp (`.claude/skills/owasp-security`) | `8ac7965caa212b4a850aff8d3df0081ab3fa9eed` | MIT |
| `skills/{sharp-edges,differential-review,spec-to-code-compliance,agentic-actions-auditor}/` | https://github.com/trailofbits/skills (`plugins/<name>/skills/<name>`) | `196a9073ab10d35bacf111f945e02c00b2c6883a` | CC BY-SA 4.0 |
| `skills/insecure-defaults/references/` | https://github.com/trailofbits/skills (`plugins/insecure-defaults/references`) | `196a9073ab10d35bacf111f945e02c00b2c6883a` | CC BY-SA 4.0 |
| `skills/{auditing-code-for-vulnerabilities,reviewing-cryptography,auditing-supply-chain,hunting-web-backdoors,reviewing-code-changes,attacking-saml,testing-web-applications,testing-apis,exploiting-ssrf}/` | https://github.com/trilwu/secskills (`secskills-core/skills`, `secskills-offense/skills`) | `ca53957bcd8e3b83b5d4d190bb3ad008a4f15c84` | MIT |
| `skills/15-blue-team-defense/` | https://github.com/Masriyan/Claude-Code-CyberSecurity-Skill (`skills/15-blue-team-defense`) | `3aa77d84fb64cf07b550f6be4544bb91292db89f` | MIT (mit NOTICE) |
| `skills/auditing-supply-chain/references/package-evaluation-criteria.md` | https://github.com/snyk/studio-recipes (`command_directives/synchronous_remediation/skills/secure-dependency-health-check/references`) | `3752dd05a462184dcce44af3c247f287b41e35de` | Apache-2.0 |

## vercel-labs/web-interface-guidelines

```
MIT License

Copyright (c) 2025 Vercel Labs

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Leonxlnx/taste-skill

```
MIT License

Copyright (c) 2026 Leonxlnx

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Sicherheits-Skills (übernommen am 26.10.2026)

Alle Dateien vor der Übernahme gelesen und auf versteckte Anweisungen geprüft (unsichtbare
Zeichen, Abruf-/Ausführungsbefehle, Netzwerkziele). Die Skills sind Prüflisten und Methoden; die
Angriffs-Skills (`attacking-saml`, `testing-web-applications`, `testing-apis`, `exploiting-ssrf`)
gelten nur für Selbstprüfungen an Klick und both.money. Projektregeln (CLAUDE.md) gehen vor.

**Nicht übernommen:** Skripte und Workflows (`insecure-defaults/workflows`, `tests`,
`15-blue-team-defense/scripts/hardening_checker.py`, Python in `supply-chain-risk-auditor`),
`agents/openai.yaml`, das Trail-of-Bits-Logo (`assets/*.svg`), `escalating-linux-privileges`
(lädt Fremdskripte und führt sie aus). Ohne Lizenz und deshalb nur gelesen, nicht übernommen:
Eyadkelleh/awesome-skills-security, dralgorhythm/claude-agentic-framework. agentskills.io diente
als Formatvorlage für `SKILL.md`.

**Lokale Änderungen:**
- `reviewing-cryptography`, `auditing-supply-chain`, `hunting-web-backdoors` (MIT): Abschnitt
  „Reading External Sources“ entfernt (schickte Adressen und Seiteninhalte über den Fremddienst
  defuddle.md).
- `insecure-defaults/SKILL.md` ist eine eigene Datei (kein Teil von Trail of Bits); die Dateien
  unter `references/` sind unverändert.
- Trail-of-Bits-Dateien (CC BY-SA 4.0) sind unverändert. Wer sie ändert, gibt die Änderung unter
  CC BY-SA 4.0 weiter und vermerkt sie hier.

**Aktualisieren:** Repo auf festem Commit klonen, Ordner diffen und lesen (neue Netzwerkziele,
Befehle, versteckte Zeichen), ersetzen, lokale Änderungen wieder einsetzen, Commit-SHA oben anpassen.

## trailofbits/skills

Copyright (c) Trail of Bits. Lizenz: Creative Commons Attribution-ShareAlike 4.0 International
(https://creativecommons.org/licenses/by-sa/4.0/), Volltext in `.claude/licenses/CC-BY-SA-4.0.txt`.
Übernommen ohne Änderungen.

## agamm/claude-code-owasp

```
MIT License

Copyright (c) 2026

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## trilwu/secskills

```
MIT License

Copyright (c) 2025 Tri Luu

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Masriyan/Claude-Code-CyberSecurity-Skill

Autor: Riyan Pratama (Masriyan / sudo3rs). MIT-Lizenz und NOTICE liegen unverändert im Ordner
`skills/15-blue-team-defense/` (`LICENSE`, `NOTICE`); `SKILL.md` ist unverändert.

## snyk/studio-recipes

Quelle: Snyk (snyk/studio-recipes). Lizenz: Apache License 2.0, Volltext in `.claude/licenses/Apache-2.0.txt`.
`package-evaluation-criteria.md` ist unverändert.
