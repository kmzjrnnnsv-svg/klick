// Die einzige Mailadresse der Plattform: Absender aller Mails und Kontakt
// (security.txt, SECURITY.md). Neue Stellen nutzen diese Konstante —
// tests/platform-mail.test.ts lässt keine zweite @raza.work-Adresse zu.
// Pure, ohne Importe (lib/env.ts lädt sie beim Start).
export const PLATFORM_MAIL = "no-reply@raza.work";
export const MAIL_FROM_DEFAULT = `Klick <${PLATFORM_MAIL}>`;
