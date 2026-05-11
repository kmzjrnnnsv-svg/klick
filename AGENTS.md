<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Schema-Types nie redeklarieren

Wenn ein Shape schon in `db/schema.ts` (z.B. `ProfileExperience`, `ProfileSkill`,
`JobRequirement`) oder in `lib/ai/types.ts` (z.B. `CareerAnalysis`,
`ExtractedProfile`) existiert: **importieren, nicht in der Komponente nochmal
auftippen.** Schmalere Sub-Shapes über `Pick<…>`, Erweiterungen über
`X & { _key: string }` (siehe `LocalRequirement` in `components/jobs/job-form.tsx`).

Diese Klasse Bug („lokales Lookalike-Shape driftet vom Schema") hat in der
Vergangenheit mehrfach den Production-Build gebrochen, weil `string` plötzlich
auf einen Literal-Union-Enum trifft.

# Vor Commit: `pnpm preflight`

`pnpm preflight` = `pnpm typecheck && pnpm lint && pnpm test`. Wenn das grün
ist, läuft auch `pnpm release` durch. CI auf GitHub Actions (`.github/workflows/ci.yml`)
fährt dasselbe bei jedem Push — wenn dort ein roter X erscheint, **bitte nicht**
auf dem Server `git pull && pnpm release` ausführen, sonst startet `klick`
nicht neu.
