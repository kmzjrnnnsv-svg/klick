import type { PriceItemKey } from "@/lib/pricing/items";

// So rechnest du ab — öffentlich auf /preise und /leistungen, in der App
// unter Einstellungen → Abo & Leistungen. Beträge kommen aus dem CMS
// (lib/pricing); `{seat}` wird beim Rendern durch den Preis des
// Berater-Zugangs ersetzt. Du-Form (tests/du-form.test.ts).

export type BillingTerm = {
	key: "software" | "seats" | "consulting";
	title: string;
	when: string;
	text: string;
	price: PriceItemKey | null;
};

export const BILLING_TERMS: readonly BillingTerm[] = [
	{
		key: "software",
		title: "Software",
		when: "Fällig erst nach dem bestandenen Audit, dann jährlich.",
		text: "Eine Jahresgebühr, fällig wenn ihr das Audit bestanden habt, danach jedes Jahr nach dem bestandenen Folgeaudit. Bis dahin kostet die Software nichts. Eine Monatszahlung gibt es nicht.",
		price: "plan:start",
	},
	{
		key: "seats",
		title: "Berater-Zugänge",
		when: "Fällig ab dem ersten Tag, jährlich.",
		text: "Jede Berater:in, die in eurem Klick mitarbeitet, kostet einen Jahresbetrag je Zugang, unabhängig vom Audit.",
		price: "seat:consultant",
	},
	{
		key: "consulting",
		title: "Beratung durch uns",
		when: "Festpreis nach dem Erstgespräch.",
		text: "Umfang und Preis besprechen wir, wenn du dich meldest. Danach bekommst du einen Festpreis schriftlich.",
		price: null,
	},
];

// Der Weg in drei Stationen (Zeitleiste auf /preise)
export const BILLING_TIMELINE: readonly { at: string; what: string }[] = [
	{
		at: "Heute",
		what: "Du startest mit Klick. Die Software kostet noch nichts.",
	},
	{
		at: "Audit bestanden",
		what: "Jetzt wird die Jahresgebühr für die Software fällig.",
	},
	{
		at: "Jedes Folgejahr",
		what: "Wieder nach dem bestandenen Folgeaudit, nicht vorher.",
	},
];

export const BILLING_FAQ: readonly { q: string; a: string }[] = [
	{
		q: "Was heißt „Audit bestanden“?",
		a: "Gemeint ist das Audit, auf das ihr mit Klick hinarbeitet und das im Vertrag steht, zum Beispiel die Zertifizierung nach ISO 27001 oder die Prüfung nach DORA. Bestanden heißt: Das Zertifikat wird erteilt oder bestätigt, oder der Prüfbericht enthält keine Feststellung, die das verhindert.",
	},
	{
		q: "Und wenn wir das Audit nicht bestehen?",
		a: "Dann zahlt ihr für dieses Jahr keine Software-Gebühr, arbeitet aber weiter und zahlt, sobald das nächste Audit bestanden ist.",
	},
	{
		q: "Gibt es eine Monatszahlung?",
		a: "Nein. Abgerechnet wird jährlich: die Software nach dem bestandenen Audit, Berater-Zugänge ab dem ersten Tag.",
	},
	{
		q: "Was kostet ein Berater-Zugang?",
		a: "{seat} je Zugang und Jahr, ab dem ersten Tag. Zugänge für Prüfer:innen auf Zeit sind in der Software enthalten.",
	},
];

export const withSeatPrice = (text: string, seat: string) =>
	text.replaceAll("{seat}", seat);
