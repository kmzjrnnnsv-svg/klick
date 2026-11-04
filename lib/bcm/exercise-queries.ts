import { and, desc, eq } from "drizzle-orm";
import { bcmExercises, processes, sites } from "@/db/schema";
import type { OrgTx } from "@/lib/db/with-org";

// Notfallübungen lesen (immer in readOrg/withOrg)

export async function exercisesForProcess(
	tx: OrgTx,
	orgId: string,
	processId: string,
) {
	return tx
		.select({
			id: bcmExercises.id,
			title: bcmExercises.title,
			kind: bcmExercises.kind,
			status: bcmExercises.status,
			plannedAt: bcmExercises.plannedAt,
			endedAt: bcmExercises.endedAt,
			result: bcmExercises.result,
			recoveryMinutes: bcmExercises.recoveryMinutes,
		})
		.from(bcmExercises)
		.where(
			and(
				eq(bcmExercises.organizationId, orgId),
				eq(bcmExercises.processId, processId),
			),
		)
		.orderBy(desc(bcmExercises.createdAt))
		.limit(20);
}

export async function exerciseById(tx: OrgTx, orgId: string, id: string) {
	const [row] = await tx
		.select({
			exercise: bcmExercises,
			processCode: processes.code,
			processName: processes.name,
			rtoHours: processes.rtoHours,
			rpoHours: processes.rpoHours,
			siteName: sites.name,
		})
		.from(bcmExercises)
		.leftJoin(processes, eq(processes.id, bcmExercises.processId))
		.leftJoin(sites, eq(sites.id, bcmExercises.siteId))
		.where(and(eq(bcmExercises.organizationId, orgId), eq(bcmExercises.id, id)))
		.limit(1);
	return row ?? null;
}
