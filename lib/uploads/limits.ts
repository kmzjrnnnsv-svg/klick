// Größengrenze für Uploads — ohne Abhängigkeiten, damit auch Client-
// Komponenten vor dem Senden prüfen können (Server prüft in validate.ts).
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
