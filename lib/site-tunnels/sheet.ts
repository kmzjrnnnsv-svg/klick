import type { DocModel } from "@/lib/export/doc-model";
import { type TunnelValues, valueRows } from "./config";
import {
	fillStep,
	type SiteVendor,
	TRANSFER_STEP,
	VENDOR_GUIDES,
} from "./vendors";

// Blatt für die IT (Standort-Tunnel, ADR-033), rein: Werte und Schritte für
// die Firewall der Kundin als Dokumentmodell (PDF über lib/export/pdf.ts).
// Kein Geheimnis im Blatt: Pre-shared Key bzw. WireGuard-Datei holt die IT
// über den Link (#klk_site_…) oder die Inhaberin unter Einstellungen > Netzwerk.

export function siteSheet(input: {
	orgName: string;
	tunnelName: string;
	vendor: SiteVendor;
	values: TunnelValues;
	exportLine: string;
	date: string;
}): DocModel {
	const g = VENDOR_GUIDES[input.vendor];
	const v = input.values;
	const fill = (s: string) =>
		fillStep(s, {
			server: v.server,
			service: v.service,
			nets: v.nets.join(", "),
			transfer: v.transferNet,
			port: v.port,
			host: v.host,
		});
	const steps = [
		...(v.transferNet ? [fill(TRANSFER_STEP)] : []),
		...(g.steps[v.tech] ?? []).map(fill),
	];
	const tech = v.tech === "ipsec" ? "IPsec (IKEv2)" : "WireGuard";
	return {
		title: `Standort verbinden: ${input.tunnelName}`,
		subtitle: `${g.label}, ${tech}`,
		org: input.orgName,
		meta: [
			["Standort", input.tunnelName],
			["Firewall", g.label],
			["Stand", input.date],
		],
		blocks: [
			{
				type: "paragraph",
				text: `Dein Büro baut einen verschlüsselten Tunnel zu Klick. Darin ist Klick unter ${v.service} erreichbar. Danach kann eure Organisation festlegen, dass Klick nur noch aus dem Büro geht.`,
			},
			{ type: "heading", level: 2, text: "Werte" },
			{
				type: "keyValue",
				items: valueRows(v).map((r) => [r.label, r.value] as [string, string]),
			},
			...(g.note
				? [{ type: "paragraph" as const, text: g.note, muted: true }]
				: []),
			{ type: "heading", level: 2, text: `Schritte bei ${g.label}` },
			{ type: "list", items: steps },
			{ type: "heading", level: 2, text: "Schlüssel" },
			{
				type: "paragraph",
				text:
					v.tech === "ipsec"
						? "Den Pre-shared Key zeigt Klick über den Link für die IT (14 Tage gültig). Er steht bewusst nicht auf diesem Blatt."
						: "Die WireGuard-Datei mit dem privaten Schlüssel lädst du über den Link für die IT (14 Tage gültig). Sie steht bewusst nicht auf diesem Blatt.",
			},
			{ type: "heading", level: 2, text: "Was Klick erlaubt" },
			{
				type: "list",
				items: [
					`Aus dem Tunnel nur HTTPS an ${v.service}. Klick leitet nichts in andere Netze weiter.`,
					"Der Tunnel kommt nur von deiner öffentlichen IP oben an.",
					"Steht der Tunnel, zeigt Klick ihn als „verbunden“. Bricht er länger als zehn Minuten ab, bekommen die Inhaber:innen Bescheid.",
				],
			},
		],
		footer: input.exportLine,
	};
}
