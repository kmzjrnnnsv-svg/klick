# PDF-Testdateien (lib/dlp/pdf-text.ts)

Selbst erzeugt, ohne fremde Inhalte:

- `libreoffice-v1.pdf`, `libreoffice-v2.pdf`: `pandoc libreoffice-vN.md -o x.docx`, dann
  `soffice --headless --convert-to pdf x.docx` (Type0-Schriften mit ToUnicode, wie Word-Exporte).
  v2 ändert ein Wort, einen Listenpunkt und eine Tabellenzeile.
- `encrypted.pdf`: v1 mit Kennwort (`writer_pdf_Export` mit `EncryptFile`).
- `chromium.pdf`: HTML-Seite über Playwright `page.pdf()` (Skia).
- `image-only.pdf`: nur eine Grafik, kein Text (wie ein Scan).
