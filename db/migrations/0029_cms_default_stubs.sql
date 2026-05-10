-- Backfill default CMS-Stubs für /datenschutz und /impressum, damit die
-- Footer-Links nicht 404en. Idempotent durch UNIQUE(tenant_id, slug).
-- Inhalt ist absichtlich Platzhalter — Admins editieren unter /admin/cms.

INSERT INTO "cms_pages" ("id", "tenant_id", "slug", "title", "body", "updated_at")
SELECT
  gen_random_uuid()::text,
  t.id,
  'impressum',
  'Impressum',
  'Pflicht-Platzhalter. Trag hier unter /admin/cms die echten Angaben nach §5 TMG ein: Anbieter, Anschrift, Vertretungsberechtigte, Kontakt, Handelsregister, USt-IdNr. (falls vorhanden).',
  now()
FROM "tenants" t
ON CONFLICT ("tenant_id", "slug") DO NOTHING;--> statement-breakpoint

INSERT INTO "cms_pages" ("id", "tenant_id", "slug", "title", "body", "updated_at")
SELECT
  gen_random_uuid()::text,
  t.id,
  'datenschutz',
  'Datenschutz',
  'Pflicht-Platzhalter. Trag hier unter /admin/cms die Datenschutzerklärung nach DSGVO ein: Verantwortlicher, Datenkategorien, Rechtsgrundlage, Speicherdauer, Empfänger, Betroffenenrechte, Datenschutzbeauftragte:r (falls vorhanden), Beschwerderecht.',
  now()
FROM "tenants" t
ON CONFLICT ("tenant_id", "slug") DO NOTHING;
