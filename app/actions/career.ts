"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import type { ProfileExperience } from "@/db/schema";
import { candidateProfiles, users } from "@/db/schema";
import { getAIProvider } from "@/lib/ai";
import type { CareerAnalysis, ExtractedProfile } from "@/lib/ai/types";

async function requireCandidate(): Promise<string> {
	const session = await auth();
	if (!session?.user?.id) throw new Error("unauthenticated");
	const [u] = await db
		.select({ role: users.role })
		.from(users)
		.where(eq(users.id, session.user.id))
		.limit(1);
	if (u?.role !== "candidate") throw new Error("forbidden");
	return session.user.id;
}

function profileToExtracted(
	row: typeof candidateProfiles.$inferSelect,
): ExtractedProfile {
	return {
		displayName: row.displayName ?? undefined,
		headline: row.headline ?? undefined,
		location: row.location ?? undefined,
		yearsExperience: row.yearsExperience ?? undefined,
		languages: row.languages ?? undefined,
		skills: row.skills ?? undefined,
		experience: (row.experience ?? undefined) as
			| ProfileExperience[]
			| undefined,
		education: row.education ?? undefined,
		summary: row.summary ?? undefined,
		industries: row.industries ?? undefined,
		awards: row.awards ?? undefined,
		certificationsMentioned: row.certificationsMentioned ?? undefined,
		mobility: row.mobility ?? undefined,
		preferredRoleLevel: row.preferredRoleLevel ?? undefined,
	};
}

export type CareerActionResult =
	| { ok: true; analysis: CareerAnalysis }
	| { ok: false; error: string; code: string };

// Result-pattern statt throw — sonst zeigt Next.js generisches
// "An unexpected response was received from the server" beim Client.
// Nichts darf hier nach außen werfen — alles in try/catch.
export async function refreshCareerAnalysis(): Promise<CareerActionResult> {
	try {
		let userId: string;
		try {
			userId = await requireCandidate();
		} catch (e) {
			return {
				ok: false,
				code: "auth",
				error: e instanceof Error ? e.message : "auth_failed",
			};
		}

		let profile: typeof candidateProfiles.$inferSelect | undefined;
		try {
			const rows = await db
				.select()
				.from(candidateProfiles)
				.where(eq(candidateProfiles.userId, userId))
				.limit(1);
			profile = rows[0];
		} catch (e) {
			console.error("[career] profile read failed", e);
			return {
				ok: false,
				code: "db_read_failed",
				error: e instanceof Error ? e.message : "db_read_failed",
			};
		}
		if (!profile) {
			return {
				ok: false,
				code: "no_profile",
				error: "Bitte fülle erst dein Profil aus (mindestens Name + Skills).",
			};
		}

		let analysis: CareerAnalysis;
		try {
			const ai = getAIProvider();
			// Hard timeout — reverse-Proxy (nginx default 60s) würde sonst die
			// Response abschneiden und der Client sieht ein generisches
			// "An unexpected response was received from the server".
			// 120s gibt Claude für die strukturierte Analyse (Salary +
			// Stärken + Wachstumsfelder + Branchen + Zertifizierungen +
			// Rollen + Pros/Cons + Markt) realistischen Spielraum.
			analysis = await Promise.race<CareerAnalysis>([
				ai.analyzeCareerProspects({
					profile: profileToExtracted(profile),
					yearsActive: profile.yearsExperience ?? undefined,
					insights: profile.insights,
				}),
				new Promise<CareerAnalysis>((_, reject) =>
					setTimeout(
						() => reject(new Error("Timeout nach 120s – versuch's nochmal.")),
						120_000,
					),
				),
			]);
		} catch (e) {
			console.error("[career] AI analyze failed", e);
			return {
				ok: false,
				code: "ai_failed",
				error:
					e instanceof Error
						? `KI konnte das Profil nicht auswerten: ${e.message}`
						: "KI konnte das Profil nicht auswerten.",
			};
		}

		// DB-Persist ist nice-to-have, nicht critical. Wenn die Spalte fehlt,
		// liefern wir die Analyse trotzdem zurück — Client zeigt sie inline,
		// nur ohne Persistenz.
		let persisted = false;
		try {
			await db
				.update(candidateProfiles)
				.set({ careerAnalysis: analysis, careerAnalysisAt: new Date() })
				.where(eq(candidateProfiles.userId, userId));
			persisted = true;
		} catch (e) {
			console.error("[career] DB update failed (non-fatal)", e);
		}

		// revalidatePath ist orthogonal — wenn es throwt darf das die Action
		// nicht kaputtmachen (= "unexpected response"-Trigger).
		try {
			revalidatePath("/profile");
		} catch (e) {
			console.error("[career] revalidatePath failed (non-fatal)", e);
		}

		if (!persisted) {
			console.warn("[career] returning analysis without persistence");
		}
		return { ok: true, analysis };
	} catch (e) {
		// Last-resort: irgend was Unerwartetes
		console.error("[career] unexpected", e);
		return {
			ok: false,
			code: "unexpected",
			error: e instanceof Error ? e.message : "unbekannter Fehler",
		};
	}
}

export async function getMyCareerAnalysis(): Promise<{
	analysis: CareerAnalysis | null;
	updatedAt: Date | null;
}> {
	const userId = await requireCandidate();
	try {
		const [row] = await db
			.select({
				analysis: candidateProfiles.careerAnalysis,
				updatedAt: candidateProfiles.careerAnalysisAt,
			})
			.from(candidateProfiles)
			.where(eq(candidateProfiles.userId, userId))
			.limit(1);
		return {
			analysis: (row?.analysis ?? null) as CareerAnalysis | null,
			updatedAt: row?.updatedAt ?? null,
		};
	} catch (e) {
		// Column probably missing. Gracefully degrade so /profile renders.
		console.warn("[career] read failed, degrading", e);
		return { analysis: null, updatedAt: null };
	}
}
