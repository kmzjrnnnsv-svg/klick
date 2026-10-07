import { asc, desc, eq } from "drizzle-orm";
import {
	dataSubjectRequests,
	insurancePolicies,
	processingActivities,
} from "@/db/schema";
import type { OrgTx } from "@/lib/db/with-org";
import { userNames } from "./queries";

// Org-gescopte Lesezugriffe (P5): Datenschutz und Versicherungen — in readOrg.

export async function listProcessingActivities(tx: OrgTx, orgId: string) {
	const rows = await tx
		.select()
		.from(processingActivities)
		.where(eq(processingActivities.organizationId, orgId))
		.orderBy(asc(processingActivities.name));
	const names = await userNames(
		tx,
		rows.map((r) => r.ownerUserId),
	);
	return rows.map((r) => ({
		...r,
		ownerName: r.ownerUserId ? (names.get(r.ownerUserId) ?? null) : null,
	}));
}

export async function listDataSubjectRequests(tx: OrgTx, orgId: string) {
	const rows = await tx
		.select()
		.from(dataSubjectRequests)
		.where(eq(dataSubjectRequests.organizationId, orgId))
		.orderBy(desc(dataSubjectRequests.receivedAt));
	const names = await userNames(
		tx,
		rows.map((r) => r.ownerUserId),
	);
	return rows.map((r) => ({
		...r,
		ownerName: r.ownerUserId ? (names.get(r.ownerUserId) ?? null) : null,
	}));
}

export async function listInsurancePolicies(tx: OrgTx, orgId: string) {
	const rows = await tx
		.select()
		.from(insurancePolicies)
		.where(eq(insurancePolicies.organizationId, orgId))
		.orderBy(asc(insurancePolicies.type), asc(insurancePolicies.insurer));
	const names = await userNames(
		tx,
		rows.map((r) => r.ownerUserId),
	);
	return rows.map((r) => ({
		...r,
		ownerName: r.ownerUserId ? (names.get(r.ownerUserId) ?? null) : null,
	}));
}
