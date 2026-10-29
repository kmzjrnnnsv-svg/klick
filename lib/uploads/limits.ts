// Größengrenze für Uploads — ohne Abhängigkeiten, damit auch Client-
// Komponenten vor dem Senden prüfen können (Server prüft in validate.ts).
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

// Höchstens so viel Text liest der Parser aus einer Datei (DLP, Vergleich)
export const MAX_TEXT_CHARS = 5_000_000;
