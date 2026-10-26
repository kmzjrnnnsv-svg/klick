import { and, eq } from "drizzle-orm";
import { globalDb, sqlClient } from "../db";
import { member, organization } from "../db/auth-schema";
import { orgSettings } from "../db/schema";
import { loadEnvFiles } from "../lib/env";

// IP-Liste einer Organisation zurücksetzen (Notweg, Härtung A5):
// `pnpm org:network-reset --org <slug> --reason "…"`
//
// Für den Fall, dass sich eine Organisation mit ihrer IP-Liste ausgesperrt
// hat (Büro-Adresse gewechselt, Tunnel weg). Läuft nur am Terminal des
// Servers (root), schaltet die Liste aus (Ausnahmen und Liste für Externe
// fallen mit), schreibt in die Kette der Organisation (org.network_reset mit
// Begründung und vorherigem Stand) und in die Plattform-Kette und
// benachrichtigt alle Inhaber:innen sofort. Der Zwischenspeicher der App
// verwirft den alten Stand spätestens nach 30 Sekunden.
function arg(name: string): string | undefined {
	const i = process.argv.indexOf(`--${name}`);
	return i >= 0 ? process.argv[i + 1]?.trim() : undefined;
}

async function main() {
	loadEnvFiles();
	const slug = arg("org");
	const reason = arg("reason");
	if (!slug || !reason || reason.length < 10) {
		console.error(
			'Aufruf: pnpm org:network-reset --org <kurzname> --reason "<Begründung, mind. 10 Zeichen>"',
		);
		process.exit(2);
	}
	// Erst nach loadEnvFiles laden: Env wird beim Import gelesen
	const { mutateOrg, withPlatform } = await import("../lib/db/with-org");
	const { notify } = await import("../lib/notifications/notify");
	const { EMPTY_NETWORK_POLICY, networkPolicyOf, networkPolicyActive } =
		await import("../lib/net/network-policy");

	const [org] = await globalDb
		.select({ id: organization.id, name: organization.name })
		.from(organization)
		.where(eq(organization.slug, slug))
		.limit(1);
	if (!org) {
		console.error(`✗ Keine Organisation mit dem Kurznamen „${slug}“.`);
		process.exitCode = 1;
		return;
	}
	await withPlatform(
		{ userId: null, reason: `org:network-reset ${slug}: ${reason}` },
		async () => undefined,
	);
	const owners = await globalDb
		.select({ userId: member.userId })
		.from(member)
		.where(and(eq(member.organizationId, org.id), eq(member.role, "owner")));

	const before = await mutateOrg(
		{ orgId: org.id, userId: null },
		async (tx) => {
			const [row] = await tx
				.select({ networkPolicy: orgSettings.networkPolicy })
				.from(orgSettings)
				.where(eq(orgSettings.organizationId, org.id))
				.limit(1);
			const prev = networkPolicyOf(row?.networkPolicy);
			await tx
				.update(orgSettings)
				.set({ networkPolicy: { ...EMPTY_NETWORK_POLICY } })
				.where(eq(orgSettings.organizationId, org.id));
			await notify(tx, {
				orgId: org.id,
				recipients: owners.map((o) => o.userId),
				actorUserId: null,
				kind: "security_change",
				title: "IP-Liste vom Klick-Betrieb zurückgesetzt",
				body: `Begründung: ${reason}. Die Organisation ist wieder aus jedem Netz erreichbar. Lege die Liste unter Einstellungen > Netzwerk neu an.`,
				link: "/einstellungen?tab=netzwerk",
			});
			return {
				result: prev,
				audit: {
					action: "org.network_reset",
					target: `organization:${org.id}`,
					before: { networkPolicy: prev },
					after: { networkPolicy: EMPTY_NETWORK_POLICY, reason, via: "cli" },
				},
			};
		},
	);
	console.log(
		`\nIP-Liste von „${org.name}“ ist ausgeschaltet (vorher ${
			networkPolicyActive(before)
				? `${before.members.length} Netz(e) für Mitglieder`
				: "schon aus"
		}).\n${owners.length} Inhaber:in(nen) benachrichtigt. Wirkt in der App spätestens nach 30 Sekunden.\n`,
	);
}

main()
	.catch((err) => {
		console.error("\n✗ Zurücksetzen fehlgeschlagen:");
		console.error(err);
		process.exitCode = 1;
	})
	.finally(async () => {
		await sqlClient.end({ timeout: 5 });
		process.exit();
	});
