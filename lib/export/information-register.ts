// Informationsregister nach DORA Art. 28(3) im Schema der ITS (EU) 2024/2956
// (Meldebögen B_01.01 … B_07.01). Reine Funktion: aus Org-Profil, IKT-
// Dienstleistern, Funktionen (Prozessen) und Verknüpfungen werden die Bögen
// mit ihren Spaltencodes (c0010 …) befüllt. Spalten, die wir nicht kennen,
// bleiben leer und erscheinen als Hinweis in `warnings` — vor Abgabe über das
// BaFin-Excel/xBRL-CSV ergänzen. Kein Rechtsrat.

export type RegisterEntity = {
	name: string;
	lei: string | null;
	country: string | null; // ISO 3166-1 alpha-2
	sector: "casp" | "bank" | "payment" | "emi" | "other";
	competentAuthority: string | null;
	currency: string;
	totalAssets: number | null;
	reportingDate: string; // ISO-Datum
};

export type RegisterProvider = {
	id: string;
	name: string;
	lei: string | null;
	country: string | null;
	isIct: boolean;
	isIntraGroup: boolean;
	status: "active" | "onboarding" | "exiting" | "terminated";
	serviceType: string | null;
	serviceDescription: string | null;
	criticality: "critical" | "important" | "standard";
	substitutability: "easy" | "difficult" | "not_substitutable" | null;
	dataLocations: readonly string[];
	subcontractors: readonly {
		name: string;
		country?: string;
		service?: string;
	}[];
	contractRef: string | null;
	contractStart: string | null;
	contractEnd: string | null;
	noticePeriodDays: number | null;
	exitStrategy: string | null;
	lastAssessmentAt: string | null;
	processesPersonalData: boolean;
};

export type RegisterFunction = {
	code: string;
	name: string;
	status: "draft" | "active" | "retired";
	criticality: "critical" | "important" | "standard";
	rtoHours: number | null;
	rpoHours: number | null;
	impactNotes: string | null;
	reviewAt: string | null;
	updatedAt: Date | string;
};

export type RegisterLink = { processCode: string; providerId: string };

export type RegisterTemplate = {
	code: string;
	title: string;
	columns: { code: string; label: string }[];
	rows: string[][];
};

export type RegisterOutput = {
	templates: RegisterTemplate[];
	warnings: string[];
	reportingDate: string;
	providerCount: number;
	functionCount: number;
};

// Art der IKT-Dienstleistung (ITS Anhang III, Liste S01–S19).
export const ICT_SERVICE_TYPE: Record<string, string> = {
	cloud_iaas: "S17",
	cloud_paas: "S18",
	cloud_saas: "S19",
	hosting: "S07",
	network: "S11",
	software: "S13",
	security: "S04",
	data: "S05",
	payment: "",
	other: "",
};

export const ICT_SERVICE_LABEL: Record<string, string> = {
	S04: "IKT-Sicherheitsmanagement",
	S05: "Bereitstellung von Daten",
	S07: "IKT-, Einrichtungs- und Hosting-Dienste (ohne Cloud)",
	S11: "Netzinfrastruktur",
	S13: "Software-Lizenzierung (ohne SaaS)",
	S17: "Cloud: IaaS",
	S18: "Cloud: PaaS",
	S19: "Cloud: SaaS",
};

const LICENSED_ACTIVITY: Record<RegisterEntity["sector"], string> = {
	casp: "Kryptowerte-Dienstleistungen (MiCAR Titel V)",
	payment: "Zahlungsdienste (ZAG / PSD2)",
	emi: "E-Geld-Geschäft (ZAG)",
	bank: "Bankgeschäft (KWG / CRR)",
	other: "",
};

const ENTITY_TYPE: Record<RegisterEntity["sector"], string> = {
	casp: "Anbieter von Kryptowerte-Dienstleistungen",
	payment: "Zahlungsinstitut",
	emi: "E-Geld-Institut",
	bank: "Kreditinstitut",
	other: "Finanzunternehmen",
};

const IMPACT: Record<RegisterFunction["criticality"], string> = {
	critical: "hoch",
	important: "mittel",
	standard: "niedrig",
};

const SUBSTITUTABILITY: Record<string, string> = {
	easy: "leicht substituierbar",
	difficult: "schwer substituierbar",
	not_substitutable: "nicht substituierbar",
};

function iso(d: Date | string | null | undefined): string {
	if (!d) return "";
	return typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10);
}

function yesNo(v: boolean): string {
	return v ? "Ja" : "Nein";
}

// Kennung des Dienstleisters: LEI bevorzugt, sonst Platzhalter aus dem Namen
// (vor Abgabe durch EUID/Handelsregisternummer ersetzen).
export function providerIdentifier(p: Pick<RegisterProvider, "lei" | "name">): {
	code: string;
	type: string;
} {
	if (p.lei?.trim()) return { code: p.lei.trim(), type: "LEI" };
	const slug = p.name
		.normalize("NFKD")
		.replaceAll(/[^\w]+/g, "-")
		.replaceAll(/^-+|-+$/g, "")
		.toUpperCase()
		.slice(0, 40);
	return { code: `TMP-${slug || "DIENSTLEISTER"}`, type: "andere (ergänzen)" };
}

export function contractReference(
	p: Pick<RegisterProvider, "contractRef" | "id">,
): string {
	return p.contractRef?.trim() || `CA-${p.id.slice(0, 8).toUpperCase()}`;
}

export function functionIdentifier(index: number): string {
	return `F${String(index + 1).padStart(3, "0")}`;
}

export function buildInformationRegister(input: {
	entity: RegisterEntity;
	providers: readonly RegisterProvider[];
	functions: readonly RegisterFunction[];
	links: readonly RegisterLink[];
}): RegisterOutput {
	const warnings: string[] = [];
	const e = input.entity;
	const lei = e.lei?.trim() ?? "";
	if (!lei)
		warnings.push(
			"B_01.01/B_01.02: LEI der Organisation fehlt (Einstellungen → Organisation).",
		);
	const country = (e.country ?? "DE").toUpperCase();
	const authority = e.competentAuthority ?? (country === "DE" ? "BaFin" : "");

	const providers = input.providers.filter(
		(p) => p.isIct && p.status !== "terminated",
	);
	const functions = input.functions.filter((f) => f.status !== "retired");
	const fnId = new Map(
		functions.map((f, i) => [f.code, functionIdentifier(i)]),
	);
	const linksByProvider = new Map<string, string[]>();
	for (const l of input.links) {
		const id = fnId.get(l.processCode);
		if (!id) continue;
		const list = linksByProvider.get(l.providerId) ?? [];
		list.push(id);
		linksByProvider.set(l.providerId, list);
	}

	const b0101: RegisterTemplate = {
		code: "B_01.01",
		title: "Register führende Einheit",
		columns: [
			{ code: "c0010", label: "LEI der Register führenden Einheit" },
			{ code: "c0020", label: "Name" },
			{ code: "c0030", label: "Land" },
			{ code: "c0040", label: "Art der Einheit" },
			{ code: "c0050", label: "Zuständige Behörde" },
			{ code: "c0060", label: "Meldedatum" },
		],
		rows: [
			[lei, e.name, country, ENTITY_TYPE[e.sector], authority, e.reportingDate],
		],
	};

	const b0102: RegisterTemplate = {
		code: "B_01.02",
		title: "Einheiten im Anwendungsbereich",
		columns: [
			{ code: "c0010", label: "LEI" },
			{ code: "c0020", label: "Name" },
			{ code: "c0030", label: "Land" },
			{ code: "c0040", label: "Art der Einheit" },
			{ code: "c0050", label: "Hierarchie in der Gruppe" },
			{ code: "c0060", label: "LEI des direkten Mutterunternehmens" },
			{ code: "c0070", label: "Datum der letzten Aktualisierung" },
			{ code: "c0080", label: "Datum der Aufnahme" },
			{ code: "c0090", label: "Datum der Löschung" },
			{ code: "c0100", label: "Währung" },
			{ code: "c0110", label: "Bilanzsumme" },
		],
		rows: [
			[
				lei,
				e.name,
				country,
				ENTITY_TYPE[e.sector],
				"Einzelunternehmen (keine Gruppe)",
				"",
				e.reportingDate,
				"",
				"",
				e.currency,
				e.totalAssets === null ? "" : String(e.totalAssets),
			],
		],
	};
	if (e.totalAssets === null)
		warnings.push(
			"B_01.02 c0110: Bilanzsumme fehlt (Einstellungen → Organisation).",
		);

	const b0103: RegisterTemplate = {
		code: "B_01.03",
		title: "Zweigniederlassungen",
		columns: [
			{ code: "c0010", label: "Kennung der Zweigniederlassung" },
			{ code: "c0020", label: "LEI des Hauptsitzes" },
			{ code: "c0030", label: "Name der Zweigniederlassung" },
			{ code: "c0040", label: "Land der Zweigniederlassung" },
		],
		rows: [],
	};

	const b0201: RegisterTemplate = {
		code: "B_02.01",
		title: "Vertragliche Vereinbarungen — allgemeine Angaben",
		columns: [
			{ code: "c0010", label: "Vertragsreferenz" },
			{ code: "c0020", label: "Art der vertraglichen Vereinbarung" },
			{ code: "c0030", label: "Übergeordnete Vertragsreferenz" },
			{ code: "c0040", label: "Währung" },
			{ code: "c0050", label: "Jährliche Kosten / Schätzung" },
		],
		rows: [],
	};
	const b0202: RegisterTemplate = {
		code: "B_02.02",
		title: "Vertragliche Vereinbarungen — spezifische Angaben",
		columns: [
			{ code: "c0010", label: "Vertragsreferenz" },
			{ code: "c0020", label: "LEI der nutzenden Einheit" },
			{ code: "c0030", label: "Kennung des IKT-Drittdienstleisters" },
			{ code: "c0040", label: "Art der Kennung" },
			{ code: "c0050", label: "Funktionskennung" },
			{ code: "c0060", label: "Art der IKT-Dienstleistung (S01–S19)" },
			{ code: "c0070", label: "Beginn" },
			{ code: "c0080", label: "Ende" },
			{ code: "c0090", label: "Kündigungsgrund" },
			{ code: "c0100", label: "Kündigungsfrist Finanzunternehmen (Tage)" },
			{ code: "c0110", label: "Kündigungsfrist Dienstleister (Tage)" },
			{ code: "c0120", label: "Land des anwendbaren Rechts" },
			{ code: "c0130", label: "Land der Leistungserbringung" },
			{ code: "c0140", label: "Datenspeicherung (Ja/Nein)" },
			{ code: "c0150", label: "Standort der Daten (Speicherung)" },
			{ code: "c0160", label: "Standort der Datenverarbeitung" },
			{ code: "c0170", label: "Sensibilität der Daten" },
			{ code: "c0180", label: "Grad der Abhängigkeit" },
		],
		rows: [],
	};
	const b0203: RegisterTemplate = {
		code: "B_02.03",
		title: "Gruppeninterne Vereinbarungen",
		columns: [
			{ code: "c0010", label: "Vertragsreferenz" },
			{ code: "c0020", label: "Referenz der verknüpften Vereinbarung" },
		],
		rows: [],
	};
	const b0301: RegisterTemplate = {
		code: "B_03.01",
		title: "Unterzeichnende Einheiten (Empfang von IKT-Dienstleistungen)",
		columns: [
			{ code: "c0010", label: "Vertragsreferenz" },
			{ code: "c0020", label: "LEI der unterzeichnenden Einheit" },
		],
		rows: [],
	};
	const b0302: RegisterTemplate = {
		code: "B_03.02",
		title: "Unterzeichnende IKT-Drittdienstleister",
		columns: [
			{ code: "c0010", label: "Vertragsreferenz" },
			{ code: "c0020", label: "Kennung des Dienstleisters" },
			{ code: "c0030", label: "Art der Kennung" },
		],
		rows: [],
	};
	const b0303: RegisterTemplate = {
		code: "B_03.03",
		title: "Gruppeninterne Erbringer von IKT-Dienstleistungen",
		columns: [
			{ code: "c0010", label: "Vertragsreferenz" },
			{ code: "c0020", label: "LEI der gruppeninternen Einheit" },
		],
		rows: [],
	};
	const b0401: RegisterTemplate = {
		code: "B_04.01",
		title: "Nutzende Einheiten",
		columns: [
			{ code: "c0010", label: "Vertragsreferenz" },
			{ code: "c0020", label: "LEI der nutzenden Einheit" },
			{ code: "c0030", label: "Art der Einheit" },
			{ code: "c0040", label: "Kennung der Zweigniederlassung" },
		],
		rows: [],
	};
	const b0501: RegisterTemplate = {
		code: "B_05.01",
		title: "IKT-Drittdienstleister",
		columns: [
			{ code: "c0010", label: "Kennung" },
			{ code: "c0020", label: "Art der Kennung" },
			{ code: "c0030", label: "Zusätzliche Kennung" },
			{ code: "c0040", label: "Art der zusätzlichen Kennung" },
			{ code: "c0050", label: "Rechtlicher Name" },
			{ code: "c0060", label: "Name (lateinische Schrift)" },
			{ code: "c0070", label: "Art der Person" },
			{ code: "c0080", label: "Land des Hauptsitzes" },
			{ code: "c0090", label: "Währung" },
			{ code: "c0100", label: "Jährliche Gesamtkosten" },
			{ code: "c0110", label: "Kennung des Mutterunternehmens" },
			{ code: "c0120", label: "Art der Kennung des Mutterunternehmens" },
		],
		rows: [],
	};
	const b0502: RegisterTemplate = {
		code: "B_05.02",
		title: "IKT-Lieferketten (Unterauftragnehmer)",
		columns: [
			{ code: "c0010", label: "Vertragsreferenz" },
			{ code: "c0020", label: "Art der IKT-Dienstleistung" },
			{ code: "c0030", label: "Kennung des Dienstleisters" },
			{ code: "c0040", label: "Art der Kennung" },
			{ code: "c0050", label: "Rang" },
			{
				code: "c0060",
				label: "Kennung des Empfängers der Unterauftragsleistung",
			},
			{ code: "c0070", label: "Art der Kennung des Empfängers" },
		],
		rows: [],
	};
	const b0601: RegisterTemplate = {
		code: "B_06.01",
		title: "Funktionen",
		columns: [
			{ code: "c0010", label: "Funktionskennung" },
			{ code: "c0020", label: "Zugelassene Tätigkeit" },
			{ code: "c0030", label: "Funktionsname" },
			{ code: "c0040", label: "LEI des Finanzunternehmens" },
			{ code: "c0050", label: "Kritisch oder wichtig" },
			{ code: "c0060", label: "Begründung der Kritikalität" },
			{ code: "c0070", label: "Datum der letzten Bewertung" },
			{ code: "c0080", label: "RTO (Stunden)" },
			{ code: "c0090", label: "RPO (Stunden)" },
			{ code: "c0100", label: "Auswirkung einer Einstellung" },
		],
		rows: [],
	};
	const b0701: RegisterTemplate = {
		code: "B_07.01",
		title: "Bewertung der IKT-Dienstleistungen",
		columns: [
			{ code: "c0010", label: "Vertragsreferenz" },
			{ code: "c0020", label: "Kennung des Dienstleisters" },
			{ code: "c0030", label: "Art der Kennung" },
			{ code: "c0040", label: "Art der IKT-Dienstleistung" },
			{ code: "c0050", label: "Substituierbarkeit" },
			{ code: "c0060", label: "Begründung fehlender Substituierbarkeit" },
			{ code: "c0070", label: "Datum des letzten Audits" },
			{ code: "c0080", label: "Ausstiegsplan vorhanden" },
			{ code: "c0090", label: "Reintegration möglich" },
			{ code: "c0100", label: "Auswirkung einer Einstellung" },
			{ code: "c0110", label: "Alternative Anbieter identifiziert" },
			{ code: "c0120", label: "Alternative Anbieter" },
		],
		rows: [],
	};

	for (const f of functions) {
		const id = fnId.get(f.code) as string;
		const critical = f.criticality !== "standard";
		b0601.rows.push([
			id,
			LICENSED_ACTIVITY[e.sector],
			`${f.code} ${f.name}`,
			lei,
			yesNo(critical),
			critical
				? f.impactNotes?.trim() ||
					`Kritikalität „${f.criticality}“ aus Prozessregister`
				: "",
			iso(f.reviewAt) || iso(f.updatedAt),
			f.rtoHours === null ? "" : String(f.rtoHours),
			f.rpoHours === null ? "" : String(f.rpoHours),
			IMPACT[f.criticality],
		]);
		if (critical && f.rtoHours === null)
			warnings.push(`B_06.01 ${id} (${f.code}): RTO fehlt (BIA im Prozess).`);
	}
	if (functions.length === 0)
		warnings.push("B_06.01: keine Prozesse/Funktionen erfasst (/prozesse).");

	const seenProviders = new Set<string>();
	for (const p of providers) {
		const pid = providerIdentifier(p);
		const ref = contractReference(p);
		const svc = ICT_SERVICE_TYPE[p.serviceType ?? "other"] ?? "";
		const fns = linksByProvider.get(p.id) ?? [];
		if (pid.type !== "LEI")
			warnings.push(
				`B_05.01 ${p.name}: keine LEI/EUID hinterlegt (Platzhalter ${pid.code}).`,
			);
		if (!p.contractRef?.trim())
			warnings.push(
				`B_02.01 ${p.name}: keine Vertragsreferenz (Platzhalter ${ref}).`,
			);
		if (!svc)
			warnings.push(
				`B_02.02 ${p.name}: Art der IKT-Dienstleistung (S01–S19) manuell zuordnen.`,
			);
		if (fns.length === 0)
			warnings.push(
				`B_02.02 ${p.name}: keiner Funktion zugeordnet (/prozesse → Dienstleister).`,
			);
		if (!p.country) warnings.push(`B_05.01 ${p.name}: Land fehlt.`);

		b0201.rows.push([
			ref,
			p.isIntraGroup ? "gruppenintern" : "eigenständiger Vertrag",
			"",
			e.currency,
			"",
		]);
		const dataLoc =
			p.dataLocations.length > 0
				? p.dataLocations.join(";")
				: (p.country ?? "");
		const rowsFor = fns.length > 0 ? fns : [""];
		for (const fid of rowsFor) {
			b0202.rows.push([
				ref,
				lei,
				pid.code,
				pid.type,
				fid,
				svc,
				iso(p.contractStart),
				iso(p.contractEnd),
				"",
				p.noticePeriodDays === null ? "" : String(p.noticePeriodDays),
				"",
				p.country ?? "",
				p.country ?? "",
				yesNo(p.dataLocations.length > 0 || p.processesPersonalData),
				dataLoc,
				dataLoc,
				p.processesPersonalData ? "mittel/hoch (personenbezogen)" : "niedrig",
				p.criticality === "critical"
					? "hoch"
					: p.criticality === "important"
						? "mittel"
						: "niedrig",
			]);
		}
		if (p.isIntraGroup) b0203.rows.push([ref, ""]);
		b0301.rows.push([ref, lei]);
		b0302.rows.push([ref, pid.code, pid.type]);
		if (p.isIntraGroup) b0303.rows.push([ref, pid.code]);
		b0401.rows.push([ref, lei, "Finanzunternehmen", ""]);
		if (!seenProviders.has(pid.code)) {
			seenProviders.add(pid.code);
			b0501.rows.push([
				pid.code,
				pid.type,
				"",
				"",
				p.name,
				p.name,
				"juristische Person",
				p.country ?? "",
				e.currency,
				"",
				"",
				"",
			]);
		}
		b0502.rows.push([ref, svc, pid.code, pid.type, "1", "", ""]);
		p.subcontractors.forEach((s, i) => {
			const sid = providerIdentifier({ lei: null, name: s.name });
			b0502.rows.push([
				ref,
				svc,
				sid.code,
				sid.type,
				String(i + 2),
				pid.code,
				pid.type,
			]);
			if (!seenProviders.has(sid.code)) {
				seenProviders.add(sid.code);
				b0501.rows.push([
					sid.code,
					sid.type,
					"",
					"",
					s.name,
					s.name,
					"juristische Person",
					s.country ?? "",
					e.currency,
					"",
					"",
					"",
				]);
			}
		});
		b0701.rows.push([
			ref,
			pid.code,
			pid.type,
			svc,
			p.substitutability ? (SUBSTITUTABILITY[p.substitutability] ?? "") : "",
			p.substitutability === "not_substitutable"
				? (p.serviceDescription ?? "")
				: "",
			iso(p.lastAssessmentAt),
			yesNo(Boolean(p.exitStrategy?.trim())),
			"",
			p.criticality === "critical"
				? "hoch"
				: p.criticality === "important"
					? "mittel"
					: "niedrig",
			"",
			"",
		]);
		if (p.criticality === "critical" && !p.exitStrategy?.trim())
			warnings.push(
				`B_07.01 ${p.name}: kritisch, aber kein Ausstiegsplan (DORA Art. 28(8)).`,
			);
	}
	if (providers.length === 0)
		warnings.push(
			"B_05.01: keine IKT-Dienstleister im Register (/dienstleister).",
		);

	return {
		templates: [
			b0101,
			b0102,
			b0103,
			b0201,
			b0202,
			b0203,
			b0301,
			b0302,
			b0303,
			b0401,
			b0501,
			b0502,
			b0601,
			b0701,
		],
		warnings,
		reportingDate: e.reportingDate,
		providerCount: providers.length,
		functionCount: functions.length,
	};
}

// README für das Paket: Spaltenlegende je Bogen + Hinweise zum Meldeweg.
export function registerReadme(out: RegisterOutput, orgName: string): string {
	const lines = [
		"# Informationsregister (DORA Art. 28(3), ITS (EU) 2024/2956)",
		"",
		`Organisation: ${orgName} · Stand: ${out.reportingDate} · ${out.providerCount} IKT-Dienstleister · ${out.functionCount} Funktionen`,
		"",
		"Je Meldebogen eine CSV (Trenner `;`, UTF-8 mit BOM, erste Zeile = Spaltencodes der ITS).",
		"Meldeweg: BaFin-MVP-Portal, Fachverfahren DORA, Meldefenster jährlich im März (Excel-Vorlage der BaFin oder xBRL-CSV).",
		"Geschlossene Wertelisten (Art der Einheit, Kennungstyp, Sensibilität, Abhängigkeit) sind hier in Klartext —",
		"beim Übertrag in die BaFin-Vorlage auf die EBA-Codes abbilden.",
		"",
		"## Vor Abgabe ergänzen",
		"",
		...(out.warnings.length === 0
			? ["- keine offenen Punkte erkannt"]
			: out.warnings.map((w) => `- ${w}`)),
		"",
		"## Spalten",
		"",
	];
	for (const t of out.templates) {
		lines.push(`### ${t.code} — ${t.title} (${t.rows.length} Zeilen)`);
		lines.push("");
		for (const c of t.columns) lines.push(`- \`${c.code}\` ${c.label}`);
		lines.push("");
	}
	lines.push(
		"_Orientierung nach ITS 2024/2956 — kein Rechtsrat; die Vollständigkeit prüft die IKT-Risikofunktion vor Abgabe._",
	);
	return `${lines.join("\n")}\n`;
}
