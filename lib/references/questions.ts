// Die drei Fragen, die eine Referenz beantwortet. Eine Quelle für:
//   - den Mail-Versand (app/actions/references.ts)
//   - das Antwort-Formular unter /r/[token]
//   - die Erklär-UI im Profil (components/profile/references-form.tsx)
// Bewusst kurz gehalten — drei Fragen, in 5 Minuten beantwortbar.
export const REFERENCE_QUESTIONS = [
	"In welchem Kontext habt ihr zusammengearbeitet (Rolle, Team, Zeitraum)?",
	"Was war die größte Stärke der Person aus deiner Sicht?",
	"Wo siehst du Entwicklungsfelder oder unter welchen Bedingungen würdest du erneut zusammenarbeiten?",
] as const;
