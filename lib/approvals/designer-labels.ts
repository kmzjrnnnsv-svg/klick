import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { cache } from "react";
import { member } from "@/db/auth-schema";
import { ROLE_FUNCTIONS } from "@/db/schema/enums";
import { ROLE_LABEL } from "@/lib/auth/memberships";
import { userNames } from "@/lib/compliance/queries";
import { readOrg } from "@/lib/db/with-org";
import { listOrgRoles } from "@/lib/org/roles";
import type { RuleNames } from "./designer";
import { type FactDef, TRIGGERS } from "./triggers";

// Beschriftungen für Designer, Freigabe-Leiste und Posteingang (Server).
// Optionen der Merkmale kommen aus den vorhandenen Texten der Register.

export type FactInfo = {
	key: string;
	type: FactDef["type"];
	label: string;
	options: { value: string; label: string }[];
};

export type TriggerText = { label: string; hint: string };

const OPTION_KEY: Readonly<Record<string, string>> = {
	criticality: "Providers.crit_",
	category: "Providers.category_",
	assetType: "Assets.type_",
	classification: "Evidence.class_",
	riskCategory: "Risks.category_",
	incidentClass: "Incidents.class_",
	ncPriority: "Nonconformities.priority_",
	ncSource: "Nonconformities.source_",
	indicatorType: "Organisation.indicator_",
	function: "Functions.",
	role: "Custody.role_",
};

const msgKey = (trigger: string) => trigger.replace(".", "_");

export async function triggerTexts(): Promise<Record<string, TriggerText>> {
	const t = await getTranslations();
	return Object.fromEntries(
		TRIGGERS.filter((x) => x.wired).map((x) => [
			x.key,
			{
				label: t(`Workflows.trigger_${msgKey(x.key)}` as never),
				hint: t(`Workflows.triggerHint_${msgKey(x.key)}` as never),
			},
		]),
	);
}

// Merkmale je Auslöser mit Beschriftung und Optionen
export async function factInfos(): Promise<Record<string, FactInfo[]>> {
	const t = await getTranslations();
	return Object.fromEntries(
		TRIGGERS.map((x) => [
			x.key,
			x.facts.map((f) => ({
				key: f.key,
				type: f.type,
				label: t(`Workflows.fact_${f.key}` as never),
				options:
					f.type === "enum"
						? f.options.map((o) => ({
								value: o,
								label: OPTION_KEY[f.key]
									? t(`${OPTION_KEY[f.key]}${o}` as never)
									: o,
							}))
						: [],
			})),
		]),
	);
}

export async function ruleNames(input: {
	roles: readonly { id: string; name: string }[];
	users: ReadonlyMap<string, string> | Readonly<Record<string, string>>;
}): Promise<RuleNames> {
	const tf = await getTranslations("Functions");
	const tw = await getTranslations("Workflows");
	const users =
		input.users instanceof Map
			? Object.fromEntries(input.users)
			: (input.users as Readonly<Record<string, string>>);
	return {
		functions: Object.fromEntries(
			ROLE_FUNCTIONS.map((f) => [f, tf(f as never)]),
		),
		roles: {
			...ROLE_LABEL,
			...Object.fromEntries(input.roles.map((r) => [r.id, r.name])),
		},
		users,
		ownerOfEntity: tw("ownerOfEntity"),
		approverOfEntity: tw("approverOfEntity"),
		notRequester: tw("notRequester"),
		unknown: tw("unknownStelle"),
	};
}

// Namen aller Stellen einer Org (eigene Rollen, Personen) — je Request
// gecacht für Freigabe-Leiste und Posteingang
export const orgRuleNamesCached = cache(
	async (orgId: string, userId: string): Promise<RuleNames> => {
		const { roles, users } = await readOrg({ orgId, userId }, async (tx) => {
			const roles = await listOrgRoles(tx, orgId);
			const ids = await tx
				.select({ userId: member.userId })
				.from(member)
				.where(eq(member.organizationId, orgId));
			return {
				roles,
				users: await userNames(
					tx,
					ids.map((m) => m.userId),
				),
			};
		});
		return ruleNames({ roles, users });
	},
);
