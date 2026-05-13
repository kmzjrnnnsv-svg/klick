import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { aiEvaluations } from "@/db/schema";

// Speichert eine KI-Auswertung in der Historie. Niemals werfen — Logging
// darf den eigentlichen Call nie killen.
export async function recordAiEvaluation(input: {
	userId: string;
	kind: string;
	key?: string | null;
	inputSnapshot?: unknown;
	output: unknown;
	provider: string;
	model?: string;
}): Promise<void> {
	try {
		await db.insert(aiEvaluations).values({
			userId: input.userId,
			kind: input.kind,
			key: input.key ?? null,
			inputSnapshot: input.inputSnapshot ?? null,
			output: input.output as object,
			provider: input.provider,
			model: input.model ?? null,
		});
	} catch (e) {
		console.warn(
			"[ai-eval] recordAiEvaluation failed",
			{ kind: input.kind },
			e,
		);
	}
}

// Liest die letzten N Einträge für User + Kind + (optional) Key.
// Liefert in absteigender Reihenfolge (neueste zuerst).
export async function recentAiEvaluations<T = unknown>(input: {
	userId: string;
	kind: string;
	key?: string | null;
	limit?: number;
}): Promise<Array<{ output: T; createdAt: Date }>> {
	try {
		const limit = input.limit ?? 3;
		const conds = [
			eq(aiEvaluations.userId, input.userId),
			eq(aiEvaluations.kind, input.kind),
		];
		if (input.key !== undefined) {
			conds.push(
				input.key === null
					? isNull(aiEvaluations.key)
					: eq(aiEvaluations.key, input.key),
			);
		}
		const rows = await db
			.select({
				output: aiEvaluations.output,
				createdAt: aiEvaluations.createdAt,
			})
			.from(aiEvaluations)
			.where(and(...conds))
			.orderBy(desc(aiEvaluations.createdAt))
			.limit(limit);
		return rows.map((r) => ({
			output: r.output as T,
			createdAt: r.createdAt,
		}));
	} catch (e) {
		console.warn(
			"[ai-eval] recentAiEvaluations failed",
			{ kind: input.kind },
			e,
		);
		return [];
	}
}
