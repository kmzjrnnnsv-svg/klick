-- Pfeile nur, wo Apple sie zeigt (docs/design/hig.md): Vorlagentexte, die
-- schon in der Datenbank stehen, auf die neue Fassung ziehen. Geändert wird
-- nur, was noch wörtlich der alten Vorlage entspricht — eigene Texte bleiben.
SELECT set_config('app.scope', 'platform', true);--> statement-breakpoint
UPDATE "approval_workflows" SET "description" = CASE "description"
	WHEN 'Eigner:in → Compliance → Geschäftsleitung (Richtlinien); Verfahren enden bei Compliance.' THEN 'Eigner:in, dann Compliance, bei Richtlinien zuletzt die Geschäftsleitung; Verfahren enden bei Compliance.'
	WHEN 'Incident-Manager:in → ISB.' THEN 'Incident-Manager:in, dann ISB.'
	WHEN 'Owner → ISB; bei kritischen Controls zusätzlich Geschäftsleitung.' THEN 'Owner, dann ISB; bei kritischen Controls zusätzlich Geschäftsleitung.'
	WHEN 'IT → IKT-Risikokontrolle → Geschäftsleitung bei kritisch (MaRisk AT 8, DORA 8(3)).' THEN 'IT, dann IKT-Risikokontrolle, bei kritisch zuletzt die Geschäftsleitung (MaRisk AT 8, DORA 8(3)).'
	WHEN 'Auslagerungsbeauftragte:r → Geschäftsleitung: Freigabe trotz kritischem Bewertungsergebnis bzw. bei wesentlicher Auslagerung.' THEN 'Auslagerungsbeauftragte:r, dann Geschäftsleitung: Freigabe trotz kritischem Bewertungsergebnis bzw. bei wesentlicher Auslagerung.'
	WHEN 'Prozess-Owner → ISB.' THEN 'Prozess-Owner, dann ISB.'
	WHEN 'Vertrieb → Compliance (MiCAR Art. 66).' THEN 'Vertrieb, dann Compliance (MiCAR Art. 66).'
	WHEN 'Geldwäschebeauftragte:r → Geschäftsleitung (GwG § 5).' THEN 'Geldwäschebeauftragte:r, dann Geschäftsleitung (GwG § 5).'
	WHEN 'Finanzen → Geschäftsleitung (MiCAR Art. 67, § 15 ZAG).' THEN 'Finanzen, dann Geschäftsleitung (MiCAR Art. 67, § 15 ZAG).'
	ELSE "description" END
WHERE "custom" = false AND "description" LIKE '%→%';--> statement-breakpoint
UPDATE "cms_pages" SET "body" = replace("body", 'unter Admin → CMS ein.', 'unter Admin > Rechtstexte ein.')
WHERE "body" LIKE '%noch nicht%unter Admin → CMS ein.%';
