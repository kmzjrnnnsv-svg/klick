import { describe, expect, it } from "vitest";
import {
	informsManagement,
	managementAckState,
} from "@/lib/compliance/incident-management";
import { collectDueItems, type DueRows } from "@/lib/jobs/compliance-tick";

// Meldungen an die Aufsicht: die Geschäftsleitung wird informiert und nimmt
// zur Kenntnis; nach 24 h erinnert der Tick.

const NOW = new Date("2026-10-25T09:00:00Z");
const HOUR = 3_600_000;

describe("Geschäftsleitung informieren", () => {
	it("nur meldepflichtige Vorfälle (schwerwiegend, erheblich)", () => {
		expect(informsManagement("major")).toBe(true);
		expect(informsManagement("significant")).toBe(true);
		expect(informsManagement("minor")).toBe(false);
		expect(informsManagement(null)).toBe(false);
	});

	it("Kenntnisnahme: offen, nach 24 h überfällig, erledigt", () => {
		const base = {
			classification: "major",
			classifiedAt: new Date(NOW.getTime() - 2 * HOUR),
			managementAcknowledgedAt: null,
		};
		expect(managementAckState(base, NOW)).toBe("open");
		expect(
			managementAckState(
				{ ...base, classifiedAt: new Date(NOW.getTime() - 25 * HOUR) },
				NOW,
			),
		).toBe("overdue");
		expect(
			managementAckState({ ...base, managementAcknowledgedAt: NOW }, NOW),
		).toBe("done");
		expect(managementAckState({ ...base, classification: "minor" }, NOW)).toBe(
			"none",
		);
	});
});

describe("Tick: Erinnerung an die Geschäftsleitung", () => {
	const rows = (acknowledged: Date | null): DueRows =>
		({
			orgOwnerIds: ["owner-1"],
			managementIds: ["gl-1", "gl-2"],
			controlReviews: [],
			documentReviews: [],
			providerAssessments: [],
			evidenceExpiring: [],
			approvals: [],
			exceptions: [],
			trainingAssignments: [],
			incidents: [
				{
					id: "i1",
					code: "INC-2026-007",
					title: "Ausfall Zahlungs-API",
					ownerUserId: "im",
					status: "open",
					classification: "major",
					classifiedAt: new Date(NOW.getTime() - 30 * HOUR),
					managementAcknowledgedAt: acknowledged,
					clocks: [],
				},
			],
			acknowledgements: [],
			obligationRuns: [],
			legalChanges: [],
			nonconformities: [],
			tlpt: null,
			regulatorDeadlines: [],
			accessExpiring: [],
			dataSubjectRequests: [],
			insurancePolicies: [],
			openTasks: [],
		}) as DueRows;

	it("erinnert alle Mitglieder der Geschäftsleitung, bis jemand bestätigt", () => {
		const open = collectDueItems(NOW, rows(null)).notifications.filter(
			(n) => n.kind === "management_info",
		);
		expect(open).toHaveLength(1);
		expect(open[0]?.recipients).toEqual(["gl-1", "gl-2"]);
		const done = collectDueItems(NOW, rows(NOW)).notifications.filter(
			(n) => n.kind === "management_info",
		);
		expect(done).toHaveLength(0);
	});
});
