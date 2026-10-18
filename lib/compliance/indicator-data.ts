import { and, eq, isNotNull } from "drizzle-orm";
import {
	controlTests,
	securityFindings,
	trainingAssignments,
} from "@/db/schema";
import type { OrgTx } from "@/lib/db/with-org";
import { currentTrainings } from "@/lib/trainings/assignments";
import type { IndicatorData } from "./indicator-sources";

// Datengrundlage der Messvorschläge (C2). Mitglieder kommen vom Aufrufer
// (listOrgMembers liest Konten außerhalb des Org-Kontexts).
export async function loadIndicatorData(
	tx: OrgTx,
	orgId: string,
	members: readonly {
		role: string;
		twoFactorEnabled: boolean | null;
		passkeys: number;
	}[],
	now = new Date(),
): Promise<IndicatorData> {
	const [assignments, findings, reviews] = await Promise.all([
		tx
			.select()
			.from(trainingAssignments)
			.where(eq(trainingAssignments.organizationId, orgId)),
		tx
			.select({
				severity: securityFindings.severity,
				status: securityFindings.status,
				dueAt: securityFindings.dueAt,
			})
			.from(securityFindings)
			.where(eq(securityFindings.organizationId, orgId)),
		tx
			.select({ testedAt: controlTests.testedAt })
			.from(controlTests)
			.where(
				and(
					eq(controlTests.organizationId, orgId),
					eq(controlTests.method, "access_review"),
					isNotNull(controlTests.testedAt),
				),
			),
	]);
	const today = now.toISOString().slice(0, 10);
	return {
		trainings: [...currentTrainings(assignments, today).values()].map((x) => ({
			state: x.state,
		})),
		members: members.map((m) => ({
			role: m.role,
			mfa: Boolean(m.twoFactorEnabled) || m.passkeys > 0,
		})),
		findings,
		accessReviews: reviews.flatMap((r) =>
			r.testedAt ? [{ testedAt: r.testedAt }] : [],
		),
	};
}
