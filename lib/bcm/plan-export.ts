import type { BcmPlanContent } from "@/db/schema/bcm";
import type { AlertChannel } from "@/db/schema/enums";
import type { DocBlock } from "@/lib/export/doc-model";

// Notfallplan als Dokumentmodell (PDF, Markdown). Pure: Namen von Stellen
// und Assets kommen als Funktionen herein.

const CHANNEL: Record<AlertChannel, string> = {
	phone: "Telefon",
	sms: "SMS",
	mail: "E-Mail",
	teams: "Teams",
	other: "Sonstiges",
};

export function planDocBlocks(
	c: BcmPlanContent,
	names: { who: (ref: string) => string; asset: (id: string) => string },
): DocBlock[] {
	const or = (s: string) => s.trim() || "Nicht festgelegt";
	return [
		{ type: "heading", level: 2, text: "1. Wann gilt der Notfall?" },
		{
			type: "keyValue",
			items: [
				["Auslöser", or(c.trigger)],
				["Ruft den Notfall aus", or(c.activatedBy)],
			],
		},
		{ type: "heading", level: 2, text: "2. Sofortmaßnahmen" },
		c.immediate.length
			? {
					type: "list",
					items: c.immediate.map((x, i) => `${i + 1}. ${x.text}`),
				}
			: { type: "paragraph", text: "Keine festgelegt.", muted: true },
		{ type: "heading", level: 2, text: "3. Alarmierung" },
		{
			type: "table",
			columns: [
				{ label: "Nr.", width: 0.08 },
				{ label: "Wer", width: 0.52 },
				{ label: "Wie", width: 0.2 },
				{ label: "Binnen", width: 0.2 },
			],
			rows: c.alert.map((x, i) => [
				String(i + 1),
				names.who(x.who),
				CHANNEL[x.channel],
				x.withinMinutes === null ? "–" : `${x.withinMinutes} Min.`,
			]),
			empty: "Keine Alarmierung festgelegt.",
		},
		{ type: "heading", level: 2, text: "4. Notbetrieb" },
		{
			type: "paragraph",
			text: or(c.emergencyMode),
			muted: !c.emergencyMode.trim(),
		},
		{ type: "heading", level: 2, text: "5. Wiederanlauf" },
		{
			type: "table",
			columns: [
				{ label: "Nr.", width: 0.08 },
				{ label: "Schritt", width: 0.42 },
				{ label: "Zuständig", width: 0.25 },
				{ label: "Ziel", width: 0.1 },
				{ label: "Asset", width: 0.15 },
			],
			rows: c.recovery.map((x, i) => [
				String(i + 1),
				x.text,
				x.who ? names.who(x.who) : "–",
				x.targetHours === null ? "–" : `${x.targetHours} h`,
				x.assetId ? names.asset(x.assetId) : "–",
			]),
			empty: "Kein Wiederanlauf festgelegt.",
		},
		{ type: "heading", level: 2, text: "6. Rückkehr zum Normalbetrieb" },
		{
			type: "paragraph",
			text: or(c.returnToNormal),
			muted: !c.returnToNormal.trim(),
		},
		{ type: "heading", level: 2, text: "7. Kontakte" },
		{
			type: "table",
			columns: [
				{ label: "Name", width: 0.3 },
				{ label: "Rolle", width: 0.2 },
				{ label: "Telefon", width: 0.2 },
				{ label: "E-Mail", width: 0.3 },
			],
			rows: c.contacts.map((x) => [
				x.name,
				x.role || "–",
				x.phone || "–",
				x.mail || "–",
			]),
			empty: "Keine weiteren Kontakte.",
		},
	];
}
