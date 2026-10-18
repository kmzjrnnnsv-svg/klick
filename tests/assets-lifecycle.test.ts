import { describe, expect, it } from "vitest";
import { assetLifecycle, lifecycleTone } from "@/lib/compliance/assets";
import {
	fallbackForSource,
	newRiskHref,
	type RiskSourceData,
	riskSourceFromParams,
	scenarioForSource,
} from "@/lib/compliance/risk-sources";

const today = new Date("2026-10-17T00:00:00Z");

describe("assetLifecycle", () => {
	it("abgelaufenes Supportende ist rot und nennt das Datum", () => {
		const r = assetLifecycle(
			{ type: "system", supportEndAt: "2026-03-01", maintenance: "contract" },
			today,
		);
		expect(r.state).toBe("expired");
		expect(r.reasons[0]).toContain("01.03.2026");
		expect(lifecycleTone(r.state)).toBe("destructive");
	});
	it("keine Wartung vor bald endendem Support", () => {
		expect(
			assetLifecycle({ endOfLifeAt: "2027-01-31", maintenance: "none" }, today)
				.state,
		).toBe("no_maintenance");
	});
	it("alter Patch nur bei patchbarer Technik", () => {
		expect(
			assetLifecycle({ type: "system", lastPatchedAt: "2026-05-01" }, today)
				.state,
		).toBe("stale_patch");
		expect(
			assetLifecycle({ type: "facility", lastPatchedAt: "2026-05-01" }, today)
				.state,
		).toBe("ok");
	});
	it("Ende in ≤ 180 Tagen ist gelb, nächstes Datum wird gemeldet", () => {
		const r = assetLifecycle(
			{ endOfLifeAt: "2027-02-01", supportEndAt: "2028-01-01" },
			today,
		);
		expect(r.state).toBe("soon");
		expect(r.nextDate).toBe("2027-02-01");
	});
	it("ohne Angaben unbekannt, ausgemustert immer ok", () => {
		expect(assetLifecycle({}, today).state).toBe("unknown");
		expect(
			assetLifecycle({ status: "retired", supportEndAt: "2020-01-01" }, today)
				.state,
		).toBe("ok");
	});
});

const src = (p: Partial<RiskSourceData>): RiskSourceData => ({
	kind: "asset",
	id: "00000000-0000-0000-0000-000000000001",
	label: "Asset „Server“",
	name: "Server",
	href: "/assets",
	...p,
});

describe("scenarioForSource", () => {
	it("EOL-Server → ungepatchte Schwachstelle, Schlüssel → Schlüsselverlust", () => {
		expect(scenarioForSource(src({ lifecycle: "expired" }))).toBe("RS-ISM-05");
		expect(scenarioForSource(src({ assetType: "hsm" }))).toBe("RS-CRY-01");
	});
	it("Dienstleister: kritisch → Ausfall, rot bewertet → Sicherheitsvorfall", () => {
		expect(
			scenarioForSource(src({ kind: "provider", providerCritical: true })),
		).toBe("RS-TPR-01");
		expect(
			scenarioForSource(src({ kind: "provider_rating", ratingTraffic: "red" })),
		).toBe("RS-TPR-03");
	});
	it("Vorfall mit Personendaten → Datenpanne", () => {
		expect(
			scenarioForSource(src({ kind: "incident", incidentPersonalData: true })),
		).toBe("RS-PRV-01");
	});
	it("Lücke ohne passendes Szenario → Titel aus der Anforderung", () => {
		const s = src({
			kind: "requirement",
			name: "DORA Art. 9",
			frameworkSlug: "dora",
		});
		expect(scenarioForSource(s)).toBeNull();
		expect(fallbackForSource(s)).toEqual({
			title: "Anforderung nicht erfüllt: DORA Art. 9",
			category: "compliance_legal",
		});
		expect(scenarioForSource({ ...s, frameworkSlug: "gwg" })).toBe("RS-AML-01");
	});
});

describe("riskSourceFromParams", () => {
	it("liest die erste gültige Herkunft und baut den Link", () => {
		const id = "11111111-2222-3333-4444-555555555555";
		expect(riskSourceFromParams({ vorfall: id })).toEqual({
			kind: "incident",
			id,
		});
		expect(riskSourceFromParams({ vorfall: "x' or 1=1" })).toBeNull();
		expect(newRiskHref("security_finding", id)).toBe(
			`/risiken/neu?befund=${id}`,
		);
	});
});
