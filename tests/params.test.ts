import { describe, expect, it } from "vitest";
import { ALL_REQUIREMENTS } from "@/lib/compliance/catalog";
import {
	extractParams,
	formatParam,
	type Param,
	paramFindings,
	paramTable,
	type SourcedParam,
} from "@/lib/compliance/params";

const brief = (ps: Param[]) =>
	ps.map(
		(p) =>
			`${p.type}${"subject" in p ? `/${p.subject}` : ""}=${formatParam(p)}`,
	);
const src = (source: string, ps: Param[]): SourcedParam[] =>
	ps.map((p) => ({ ...p, source }));

describe("extractParams", () => {
	it("liest Meldefristen mit Thema, auch über Kommas hinweg", () => {
		expect(
			brief(
				extractParams(
					"Erstmeldung spätestens 4 Stunden nach Einstufung als schwerwiegend, in jedem Fall 24 Stunden nach Kenntnis; Zwischenmeldung spätestens 72 Stunden nach Abgabe der Erstmeldung; Abschlussbericht spätestens einen Monat danach.",
				),
			),
		).toEqual([
			"deadline/initial=4 h",
			"deadline/initial=24 h",
			"deadline/intermediate=3 Tage",
			"deadline/final=1 Monat",
		]);
		expect(
			brief(
				extractParams(
					"Datenpannen werden binnen 72 Stunden nach Bekanntwerden der Aufsichtsbehörde gemeldet.",
				),
			),
		).toEqual(["deadline/notification=3 Tage"]);
	});

	it("liest mehrere Intervalle in einem Satz und unterscheidet halb-/vierteljährlich", () => {
		expect(
			brief(
				extractParams(
					"Rezertifizierung privilegierter Rechte quartalsweise, aller anderen mindestens jährlich.",
				),
			),
		).toEqual(["interval/review=vierteljährlich", "interval/review=jährlich"]);
		expect(
			brief(extractParams("Meldung halbjährlich an die Bundesbank.")),
		).toEqual(["interval/report=halbjährlich"]);
		expect(
			brief(extractParams("TLPT alle drei Jahre durchführen und testen.")),
		).toEqual(["interval/test=alle 3 Jahre"]);
	});

	it("Aufbewahrung, Löschung und keine Fristen aus Schwellenwerten", () => {
		expect(
			brief(
				extractParams(
					"Unterlagen sind 5 Jahre aufzubewahren und danach unverzüglich zu löschen.",
				),
			),
		).toEqual([
			"retention=5 Jahre aufbewahren",
			"deletion=löschen, sobald nicht mehr erforderlich",
		]);
		expect(
			extractParams(
				"Schwerwiegend bei Ausfallzeit über 2 h bei kritischen Diensten.",
			),
		).toEqual([]);
	});

	it("findet im Katalog die bekannten Fristen je Rahmenwerk", () => {
		const of = (key: string) => {
			const r = ALL_REQUIREMENTS.find(
				(x) => `${x.framework}:${x.code}` === key,
			);
			return brief(
				extractParams(
					`${r?.requirementText}\n${r?.guidance ?? ""}\n${(r?.evidenceHints ?? []).join("\n")}`,
				),
			);
		};
		expect(of("dora:Art.19")).toContain("deadline/initial=4 h");
		expect(of("nis2:Art.23")).toContain("deadline/early_warning=24 h");
		expect(of("dsgvo:Art.33")).toContain("deadline/notification=3 Tage");
		expect(of("dora:Art.18")).toEqual([]);
	});
});

describe("Fristen je Rahmenwerk", () => {
	const params = [
		...src(
			"dora:Art.19",
			extractParams("Erstmeldung spätestens 4 Stunden nach Einstufung."),
		),
		...src(
			"nis2:Art.23",
			extractParams(
				"Meldung mit Erstbewertung spätestens 72 Stunden nach Kenntnis.",
			),
		),
		...src(
			"nis2:Art.23",
			extractParams("Frühwarnung spätestens 24 Stunden nach Kenntnis."),
		),
	];

	it("behält jede Vorgabe je Rahmenwerk, statt sie zu verschmelzen", () => {
		const table = paramTable(params);
		const initial = table.find((r) => r.topic === "deadline:initial");
		expect(
			initial?.perFramework.map((f) => [
				f.framework,
				f.params.map(formatParam),
			]),
		).toEqual([
			["dora", ["4 h"]],
			["nis2", ["3 Tage"]],
		]);
		expect(initial?.differs).toBe(true);
		const early = table.find((r) => r.topic === "deadline:early_warning");
		expect(early?.perFramework.map((f) => f.framework)).toEqual(["nis2"]);
		expect(early?.differs).toBe(false);
	});

	it("eigene Frist je Rahmenwerk: nur laxer als die Vorgabe ist ein Verstoß", () => {
		expect(
			paramFindings(params, [
				{ framework: "dora", topic: "deadline:initial", value: 2 },
				{ framework: "nis2", topic: "deadline:initial", value: 48 },
			]),
		).toEqual([]);
		const v = paramFindings(params, [
			{ framework: "dora", topic: "deadline:initial", value: 6 },
		]);
		expect(v).toHaveLength(1);
		expect(v[0]).toMatchObject({
			kind: "violation",
			framework: "dora",
			own: 6,
		});
	});

	it("Aufbewahrung gegen Löschung ist ein Konflikt mit Lösungshinweis", () => {
		const f = paramFindings([
			...src(
				"gwg:§8",
				extractParams("Aufzeichnungen sind 5 Jahre aufzubewahren."),
			),
			...src(
				"dsgvo:Art.17",
				extractParams(
					"Daten sind unverzüglich zu löschen, sobald sie nicht mehr erforderlich sind.",
				),
			),
		]);
		expect(f).toHaveLength(1);
		expect(f[0]).toMatchObject({
			kind: "conflict",
			type: "retention_vs_deletion",
		});
	});
});
