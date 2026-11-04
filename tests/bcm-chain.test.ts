import { describe, expect, it } from "vitest";
import { bcmChain, type ChainDependency, chainBreaks } from "@/lib/bcm/chain";

const crit = { criticality: "critical", rtoHours: 8, rpoHours: 4 };
const asset = (
	id: string,
	rto: number | null,
	rpo: number | null,
	redundancy: ChainDependency["redundancy"] = "warm",
): ChainDependency => ({
	kind: "asset",
	id,
	name: id,
	rtoHours: rto,
	rpoHours: rpo,
	redundancy,
});

describe("Kette im Notfall", () => {
	it("langsamste Abhängigkeit bestimmt den erreichbaren Wiederanlauf", () => {
		const r = bcmChain(crit, [asset("a", 4, 1), asset("b", 24, 2)]);
		expect(r.achievableRtoHours).toBe(24);
		expect(r.achievableRpoHours).toBe(2);
		expect(r.rtoOk).toBe(false);
		expect(r.rpoOk).toBe(true);
		expect(r.rows[1]?.issues).toEqual(["rto_slow"]);
		expect(chainBreaks(r)).toBe(1);
	});

	it("Datenverlust über dem RPO", () => {
		const r = bcmChain(crit, [asset("a", 2, 24)]);
		expect(r.rows[0]?.issues).toEqual(["rpo_loss"]);
		expect(r.rpoOk).toBe(false);
	});

	it("fehlende Werte: nicht prüfbar, aber als Lücke markiert", () => {
		const r = bcmChain(crit, [
			asset("a", 4, 1),
			{
				kind: "provider",
				id: "p",
				name: "Cloud",
				rtoHours: null,
				rpoHours: null,
			},
		]);
		expect(r.rtoOk).toBeNull();
		expect(r.rows[1]?.issues).toEqual(["rto_missing"]);
		expect(chainBreaks(r)).toBe(0);
		expect(r.findings).toBe(1);
	});

	it("kein Ausweichweg nur bei kritischen Prozessen", () => {
		expect(bcmChain(crit, [asset("a", 1, 1, "none")]).rows[0]?.issues).toEqual([
			"single_point",
		]);
		expect(
			bcmChain({ ...crit, criticality: "standard" }, [asset("a", 1, 1, "none")])
				.rows[0]?.issues,
		).toEqual([]);
	});

	it("ohne Ziel am Prozess nichts verfehlt", () => {
		const r = bcmChain(
			{ criticality: "critical", rtoHours: null, rpoHours: null },
			[asset("a", 100, 100)],
		);
		expect(r.rtoOk).toBeNull();
		expect(chainBreaks(r)).toBe(0);
	});

	it("ohne Abhängigkeiten nicht prüfbar", () => {
		const r = bcmChain(crit, []);
		expect(r.achievableRtoHours).toBeNull();
		expect(r.rtoOk).toBeNull();
	});
});
