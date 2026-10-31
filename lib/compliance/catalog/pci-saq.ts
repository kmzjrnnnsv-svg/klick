import { PCI_CODES, PCI_DSS_REQUIREMENTS_BASE, PCI_SP_ONLY } from "./pci-dss";
import type { CatalogRequirement, FrameworkVariant } from "./types";

// Welche Anforderungen von PCI DSS v4.0.1 für welchen Nachweisweg gelten.
// Händler mit Prüfbericht (ROC) oder SAQ D prüfen alles außer den
// Dienstleister-Anforderungen, Dienstleister alles. Die kleinen SAQ-Typen
// nach den SAQ-Dokumenten v4.0.1 als Näherung (prüfen gegen die aktuellen
// Fassungen; SAQ A seit Januar 2025 ohne 6.4.3 und 11.6.1, dafür mit der
// Bestätigung, dass die Website nicht für Skript-Angriffe anfällig ist).

export const PCI_VARIANTS: FrameworkVariant[] = [
	{
		key: "saq_d",
		label: "Händler: Prüfbericht (ROC) oder SAQ D",
		hint: "Alle Anforderungen für Händler",
	},
	{
		key: "sp",
		label: "Dienstleister: Prüfbericht (ROC) oder SAQ D",
		hint: "Alle Anforderungen, auch die nur für Dienstleister",
	},
	{
		key: "saq_a",
		label: "SAQ A",
		hint: "Online-Handel, Zahlung vollständig beim Dienstleister (Weiterleitung oder iframe)",
	},
	{
		key: "saq_a_ep",
		label: "SAQ A-EP",
		hint: "Online-Handel, eigene Website beeinflusst die Zahlungsseite",
	},
	{
		key: "saq_b",
		label: "SAQ B",
		hint: "Nur Imprinter oder eigenständige Terminals mit Wählverbindung",
	},
	{
		key: "saq_b_ip",
		label: "SAQ B-IP",
		hint: "Eigenständige, zugelassene Terminals mit IP-Verbindung",
	},
	{
		key: "saq_c_vt",
		label: "SAQ C-VT",
		hint: "Manuelle Eingabe in ein virtuelles Terminal im Browser",
	},
	{
		key: "saq_c",
		label: "SAQ C",
		hint: "Zahlungsanwendung mit Internetverbindung, keine elektronische Speicherung",
	},
	{
		key: "saq_p2pe",
		label: "SAQ P2PE",
		hint: "Nur zugelassene Punkt-zu-Punkt-Verschlüsselung (P2PE)",
	},
	{
		key: "saq_spoc",
		label: "SAQ SPoC",
		hint: "PIN-Eingabe auf handelsüblichen Geräten mit zugelassener Lösung",
	},
];

// Muster: exakter Code oder Präfix mit Punkt am Ende („9.4.“)
function match(patterns: readonly string[]): (code: string) => boolean {
	return (code) =>
		patterns.some((p) => (p.endsWith(".") ? code.startsWith(p) : code === p));
}

const MERCHANT = PCI_CODES.filter((c) => !PCI_SP_ONLY.has(c));
const only = (patterns: readonly string[]) => MERCHANT.filter(match(patterns));
const without = (base: readonly string[], patterns: readonly string[]) => {
	const m = match(patterns);
	return base.filter((c) => !m(c));
};

const SAQ_A = only([
	"2.2.2",
	"3.1.1",
	"3.2.1",
	"6.3.1",
	"6.3.3",
	"8.2.1",
	"8.2.2",
	"8.2.5",
	"8.3.1",
	"8.3.5",
	"8.3.6",
	"8.3.7",
	"8.3.9",
	"9.4.",
	"11.3.2",
	"11.3.2.1",
	"12.8.",
	"12.10.1",
]);

// Keine Speicherung, keine Terminals, keine Funknetze im Umfang
const SAQ_A_EP = without(MERCHANT, [
	"1.3.3",
	"2.3.",
	"3.3.",
	"3.4.",
	"3.5.",
	"3.6.",
	"3.7.",
	"4.2.1.2",
	"9.2.",
	"9.3.",
	"9.5.",
	"11.2.",
	"A2.",
]);

const SAQ_B = only([
	"3.1.1",
	"3.2.1",
	"3.3.1",
	"3.3.1.1",
	"3.3.1.2",
	"3.3.1.3",
	"3.4.1",
	"9.4.",
	"9.5.",
	"12.8.",
	"12.10.1",
]);

const SAQ_B_IP = [
	...SAQ_B,
	...only([
		"1.2.1",
		"1.2.2",
		"1.2.5",
		"1.3.1",
		"1.3.2",
		"1.4.1",
		"1.4.2",
		"2.2.2",
		"2.2.7",
		"4.2.1",
		"6.3.1",
		"6.3.3",
		"7.2.1",
		"7.2.2",
		"7.2.3",
		"8.2.1",
		"8.2.5",
		"8.3.1",
		"11.3.2",
		"11.3.2.1",
		"12.3.1",
	]),
];

// Virtuelles Terminal: wie A-EP ohne eigene Entwicklung, Protokollierung
// und tiefere Tests
const SAQ_C_VT = without(SAQ_A_EP, [
	"6.2.",
	"6.4.",
	"6.5.",
	"10.",
	"11.4.",
	"11.5.",
	"11.6.",
]);

// Zahlungsanwendung mit Internet: alles außer gespeicherter PAN und
// eigener Entwicklung
const SAQ_C = without(MERCHANT, [
	"3.5.",
	"3.6.",
	"3.7.",
	"6.2.",
	"6.4.3",
	"11.6.1",
	"A2.",
]);

const SAQ_P2PE = only([
	"3.1.1",
	"3.2.1",
	"3.3.1",
	"3.3.1.1",
	"3.3.1.2",
	"3.3.1.3",
	"9.4.",
	"9.5.",
	"12.8.",
	"12.10.1",
]);

const SAQ_SPOC = [...SAQ_P2PE, ...only(["5.4.1", "12.6.1", "12.6.3"])];

export const PCI_SAQ_REQUIREMENTS: Record<string, readonly string[]> = {
	saq_d: MERCHANT,
	sp: PCI_CODES,
	saq_a: SAQ_A,
	saq_a_ep: SAQ_A_EP,
	saq_b: SAQ_B,
	saq_b_ip: [...new Set(SAQ_B_IP)],
	saq_c_vt: SAQ_C_VT,
	saq_c: SAQ_C,
	saq_p2pe: SAQ_P2PE,
	saq_spoc: [...new Set(SAQ_SPOC)],
};

const BY_CODE = new Map<string, string[]>();
for (const [variant, codes] of Object.entries(PCI_SAQ_REQUIREMENTS))
	for (const c of codes) BY_CODE.set(c, [...(BY_CODE.get(c) ?? []), variant]);

export const PCI_DSS_REQUIREMENTS: CatalogRequirement[] =
	PCI_DSS_REQUIREMENTS_BASE.map((r) => ({
		...r,
		variants: BY_CODE.get(r.code) ?? ["sp"],
	}));
