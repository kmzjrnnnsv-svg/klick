import { verifyAuditChain } from "@wallet/lib/audit";
import { forEachOrg, jobOrgIds, withPlatform } from "@wallet/lib/db/with-org";
import { notify } from "@wallet/lib/notifications/notify";
import { logger } from "@/lib/log";
import { captureException } from "@/lib/observability/glitchtip";

// Täglich jede Kette prüfen. Ein Bruch ist ein Sicherheitsvorfall: Fatal-Log,
// Fehler-Tracking und Sicherheitsmeldung an die Inhaber:innen der Org.
export async function runVerifyAuditChains(): Promise<{
	checked: number;
	broken: string[];
}> {
	const broken: string[] = [];
	let checked = 0;
	const platform = await withPlatform(
		{ userId: null, reason: "Job: Audit-Kette der Plattform prüfen" },
		(tx) => verifyAuditChain(tx, null),
	);
	checked += 1;
	if (!platform.ok) broken.push("platform");
	await forEachOrg(await jobOrgIds(), async (tx, orgId) => {
		const r = await verifyAuditChain(tx, orgId);
		checked += 1;
		if (r.ok) return;
		broken.push(orgId);
		await notify(tx, {
			orgId,
			actorUserId: null,
			kind: "security_alert",
			roles: ["owner"],
			title: "Protokoll beschädigt",
			body: `Die Hash-Kette des Protokolls ist ab Eintrag ${r.brokenAtSeq} nicht mehr schlüssig (${r.reason}). Bitte sofort den Betrieb informieren.`,
			link: "/audit",
		});
	});
	if (broken.length) {
		logger.fatal({ broken }, "Audit-Kette gebrochen");
		void captureException(
			new Error(`Audit-Kette gebrochen: ${broken.join(", ")}`),
			{
				routeType: "job",
				routePath: "verify-audit-chain",
			},
		);
	}
	return { checked, broken };
}
