"use server";

import { and, desc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import {
	interests,
	type ReferenceCheck,
	referenceChecks,
	referenceDisclosures,
	users,
} from "@/db/schema";
import { sendTransactionalMail } from "@/lib/mail/send";

const REFERENCE_QUESTIONS_DE = [
	"In welchem Kontext habt ihr zusammengearbeitet (Rolle, Team, Zeitraum)?",
	"Was war die größte Stärke der Person aus deiner Sicht?",
	"Wo siehst du Entwicklungsfelder oder unter welchen Bedingungen würdest du erneut zusammenarbeiten?",
];

async function requireCandidate(): Promise<string> {
	const session = await auth();
	if (!session?.user?.id) throw new Error("unauthenticated");
	const [u] = await db
		.select({ role: users.role, name: users.name })
		.from(users)
		.where(eq(users.id, session.user.id))
		.limit(1);
	if (u?.role !== "candidate") throw new Error("forbidden");
	return session.user.id;
}

function generateToken(): string {
	const bytes = new Uint8Array(24);
	crypto.getRandomValues(bytes);
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

export async function requestReference(input: {
	refereeName: string;
	refereeEmail: string;
	refereeRelation?: string;
}): Promise<{ id: string }> {
	const userId = await requireCandidate();
	if (!input.refereeName.trim() || !input.refereeEmail.trim())
		throw new Error("name + email required");

	const token = generateToken();
	const expiresAt = new Date();
	expiresAt.setDate(expiresAt.getDate() + 21);

	const [created] = await db
		.insert(referenceChecks)
		.values({
			candidateUserId: userId,
			refereeName: input.refereeName.trim(),
			refereeEmail: input.refereeEmail.trim().toLowerCase(),
			refereeRelation: input.refereeRelation?.trim(),
			token,
			expiresAt,
		})
		.returning({ id: referenceChecks.id });

	const [me] = await db
		.select({ name: users.name })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);

	const baseUrl = process.env.AUTH_URL ?? "https://raza.work";
	await sendTransactionalMail({
		to: input.refereeEmail,
		subject: `${me?.name ?? "Eine Person"} hat dich als Referenz angefragt — Klick`,
		text:
			`${me?.name ?? "Eine Person"} hat dich auf der Plattform Klick als Referenz angefragt.\n\n` +
			`Du beantwortest drei kurze Fragen — vertraulich, nur die anfragende Person sieht deine Antworten:\n\n` +
			REFERENCE_QUESTIONS_DE.map((q, i) => `${i + 1}. ${q}`).join("\n") +
			`\n\nÖffne den Link, um zu antworten:\n${baseUrl}/r/${token}\n\n` +
			`Der Link ist 21 Tage gültig. Du kannst die Anfrage jederzeit ignorieren.`,
	});

	revalidatePath("/profile");
	return created;
}

export async function listMyReferences(): Promise<ReferenceCheck[]> {
	// fail-soft auf /profile — keine throws an die Server-Component-Render-Pipeline
	try {
		const session = await auth();
		if (!session?.user?.id) return [];
		return db
			.select()
			.from(referenceChecks)
			.where(eq(referenceChecks.candidateUserId, session.user.id))
			.orderBy(desc(referenceChecks.createdAt));
	} catch (e) {
		console.warn("[references] list failed, degrading", e);
		return [];
	}
}

export async function getReferenceByToken(token: string) {
	const [r] = await db
		.select()
		.from(referenceChecks)
		.where(eq(referenceChecks.token, token))
		.limit(1);
	if (!r) return null;
	if (r.status === "submitted")
		return { ...r, questions: REFERENCE_QUESTIONS_DE };
	if (r.expiresAt < new Date()) {
		await db
			.update(referenceChecks)
			.set({ status: "expired" })
			.where(eq(referenceChecks.id, r.id));
		return {
			...r,
			status: "expired" as const,
			questions: REFERENCE_QUESTIONS_DE,
		};
	}
	return { ...r, questions: REFERENCE_QUESTIONS_DE };
}

export async function submitReference(input: {
	token: string;
	answers: { question: string; answer: string }[];
}): Promise<void> {
	const [r] = await db
		.select()
		.from(referenceChecks)
		.where(eq(referenceChecks.token, input.token))
		.limit(1);
	if (!r) throw new Error("invalid token");
	if (r.status !== "pending") throw new Error("already used or expired");
	if (r.expiresAt < new Date()) throw new Error("expired");

	await db
		.update(referenceChecks)
		.set({
			status: "submitted",
			answers: input.answers,
			submittedAt: new Date(),
		})
		.where(eq(referenceChecks.id, r.id));

	revalidatePath(`/r/${input.token}`);
	revalidatePath("/profile");
}

export async function deleteReference(id: string): Promise<void> {
	const userId = await requireCandidate();
	await db
		.delete(referenceChecks)
		.where(
			and(
				eq(referenceChecks.id, id),
				eq(referenceChecks.candidateUserId, userId),
			),
		);
	revalidatePath("/profile");
}

// ─── Per-Interest Disclosure ───────────────────────────────────────────────
// Kandidat gibt eine submitted Reference an einen konkreten Interest frei.
// Der Employer sieht die Antworten auf seiner Interest-Detail-Seite. Revoke
// blendet sie sofort wieder aus.

async function ownInterest(
	interestId: string,
	candidateUserId: string,
): Promise<boolean> {
	const [i] = await db
		.select({ id: interests.id })
		.from(interests)
		.where(
			and(
				eq(interests.id, interestId),
				eq(interests.candidateUserId, candidateUserId),
			),
		)
		.limit(1);
	return !!i;
}

export async function grantReferenceDisclosure(input: {
	interestId: string;
	referenceCheckId: string;
}): Promise<void> {
	const userId = await requireCandidate();
	if (!(await ownInterest(input.interestId, userId)))
		throw new Error("not your interest");
	const [ref] = await db
		.select()
		.from(referenceChecks)
		.where(
			and(
				eq(referenceChecks.id, input.referenceCheckId),
				eq(referenceChecks.candidateUserId, userId),
			),
		)
		.limit(1);
	if (!ref) throw new Error("reference not yours");
	if (ref.status !== "submitted") throw new Error("reference not yet answered");

	await db
		.insert(referenceDisclosures)
		.values({
			interestId: input.interestId,
			referenceCheckId: input.referenceCheckId,
		})
		.onConflictDoUpdate({
			target: [
				referenceDisclosures.interestId,
				referenceDisclosures.referenceCheckId,
			],
			set: { revokedAt: null, grantedAt: new Date() },
		});

	revalidatePath(`/requests/${input.interestId}`);
}

export async function revokeReferenceDisclosure(input: {
	interestId: string;
	referenceCheckId: string;
}): Promise<void> {
	const userId = await requireCandidate();
	if (!(await ownInterest(input.interestId, userId)))
		throw new Error("not your interest");
	await db
		.update(referenceDisclosures)
		.set({ revokedAt: new Date() })
		.where(
			and(
				eq(referenceDisclosures.interestId, input.interestId),
				eq(referenceDisclosures.referenceCheckId, input.referenceCheckId),
			),
		);
	revalidatePath(`/requests/${input.interestId}`);
}

export async function listGrantedReferencesForInterest(
	interestId: string,
): Promise<
	Array<{
		referee: string;
		relation: string | null;
		answers: { question: string; answer: string }[];
	}>
> {
	// Auth: must be the employer side OR the candidate (read-only).
	const session = await auth();
	if (!session?.user?.id) return [];
	const rows = await db
		.select({
			ref: referenceChecks,
			disc: referenceDisclosures,
		})
		.from(referenceDisclosures)
		.innerJoin(
			referenceChecks,
			eq(referenceChecks.id, referenceDisclosures.referenceCheckId),
		)
		.where(
			and(
				eq(referenceDisclosures.interestId, interestId),
				isNull(referenceDisclosures.revokedAt),
			),
		);
	return rows
		.filter((r) => r.ref.status === "submitted" && r.ref.answers)
		.map((r) => ({
			referee: r.ref.refereeName,
			relation: r.ref.refereeRelation,
			answers: r.ref.answers ?? [],
		}));
}

export async function listMyDisclosuresForInterest(
	interestId: string,
): Promise<string[]> {
	const userId = await requireCandidate();
	if (!(await ownInterest(interestId, userId))) return [];
	const rows = await db
		.select({ id: referenceDisclosures.referenceCheckId })
		.from(referenceDisclosures)
		.where(
			and(
				eq(referenceDisclosures.interestId, interestId),
				isNull(referenceDisclosures.revokedAt),
			),
		);
	return rows.map((r) => r.id);
}
