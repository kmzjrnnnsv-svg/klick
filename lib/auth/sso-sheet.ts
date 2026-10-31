import type { DocModel } from "@/lib/export/doc-model";
import { samlAcsUrl, samlSpEntityId } from "./sso-saml";
import { SAML_PRESETS, type SamlVendor } from "./sso-saml-vendors";

// Blatt für die IT (AP10d), rein: alle Werte und Schritte, die die IT beim
// Anbieter braucht, als Dokumentmodell (PDF über lib/export/pdf.ts). Keine
// Geheimnisse: die Werte von Klick sind öffentlich, der TXT-Wert entsteht
// erst nach dem Anlegen.

export function ssoSheet(input: {
	orgName: string;
	vendor: SamlVendor;
	vendorLabel: string;
	domain: string;
	providerId: string;
	origin: string;
	steps: readonly string[];
	exportLine: string;
	date: string;
}): DocModel {
	const p = SAML_PRESETS[input.vendor];
	const entityId = samlSpEntityId(input.origin, input.providerId);
	const acs = samlAcsUrl(input.origin, input.providerId);
	return {
		title: `SSO einrichten: ${input.vendorLabel}`,
		subtitle: `Anmeldung mit dem Firmenkonto (SAML 2.0) für ${input.domain}`,
		org: input.orgName,
		meta: [
			["Domain", input.domain],
			["Kennung in Klick", input.providerId],
			["Stand", input.date],
		],
		blocks: [
			{ type: "heading", level: 2, text: "Werte von Klick" },
			{
				type: "keyValue",
				items: [
					["Bezeichner (Entity-ID)", entityId],
					["Antwortadresse (ACS-URL)", acs],
					["Bindung", "HTTP-POST"],
					["NameID", "E-Mail-Adresse"],
					["Signatur", "Assertion signiert, SHA-256 oder stärker"],
				],
			},
			{
				type: "paragraph",
				text: "Die Metadaten von Klick als Datei bekommst du von der Person, die SSO in Klick einrichtet, oder nach dem Anlegen unter der Adresse des Bezeichners.",
				muted: true,
			},
			{ type: "heading", level: 2, text: `Schritte bei ${input.vendorLabel}` },
			{ type: "list", items: [...input.steps] },
			{ type: "heading", level: 2, text: "Attribute" },
			{
				type: "table",
				columns: [
					{ label: "Angabe", width: 1 },
					{ label: "Name des Attributs", width: 3 },
				],
				rows: [
					["E-Mail", p.attributes.email],
					["Name", p.attributes.name],
					["Gruppen", p.attributes.groups ?? "keine"],
				],
			},
			{ type: "heading", level: 2, text: "Was Klick von dir braucht" },
			{
				type: "list",
				items: [
					p.metadata === "file"
						? "Die Metadaten-Datei des Anbieters (XML)."
						: "Die Adresse der Metadaten des Anbieters (https) oder die Metadaten-Datei.",
					"Die Gruppen (Name oder ID), die in Klick Mitarbeitende, Lesend oder Bearbeiter:in werden sollen.",
					"Ob der Anbieter eine Mehr-Faktor-Anmeldung meldet (dann kann Klick sie anerkennen).",
				],
			},
			{ type: "heading", level: 2, text: "Domain bestätigen" },
			{
				type: "paragraph",
				text: `Nach dem Anlegen zeigt Klick einen TXT-Eintrag für _klick-sso.${input.domain}. Leg ihn bei eurem DNS-Anbieter an. Erst danach nimmt Klick Anmeldungen an.`,
			},
			{ type: "heading", level: 2, text: "Testen" },
			{
				type: "paragraph",
				text: "Mit „Mit meinem Firmenkonto testen“ prüft Klick die Anmeldung, ohne ein Konto anzulegen, und zeigt, welche Angaben ankamen.",
			},
		],
		footer: input.exportLine,
	};
}
