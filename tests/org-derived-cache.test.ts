import { beforeEach, describe, expect, it } from "vitest";
import { clearOrgDerived, orgDerived } from "@/lib/cache/org-derived";
import type { OrgTx } from "@/lib/db/with-org";

// Zwischenspeicher je Org: neu gerechnet wird nur, wenn sich der Kopf der
// Prüfsummen-Kette (jede Mutation schreibt einen Audit-Eintrag) ändert.

const tx = {} as OrgTx;

describe("Zwischenspeicher je Org", () => {
	beforeEach(() => clearOrgDerived());

	it("rechnet einmal je Kettenkopf", async () => {
		let calls = 0;
		const compute = async () => {
			calls += 1;
			return calls;
		};
		expect(await orgDerived(tx, "org-a", "k", compute, "10")).toBe(1);
		expect(await orgDerived(tx, "org-a", "k", compute, "10")).toBe(1);
		// neuer Audit-Eintrag = neuer Kopf
		expect(await orgDerived(tx, "org-a", "k", compute, "11")).toBe(2);
		expect(calls).toBe(2);
	});

	it("trennt Orgs und Schlüssel", async () => {
		let calls = 0;
		const compute = async () => ++calls;
		await orgDerived(tx, "org-a", "k", compute, "1");
		await orgDerived(tx, "org-b", "k", compute, "1");
		await orgDerived(tx, "org-a", "anders", compute, "1");
		expect(calls).toBe(3);
	});
});
