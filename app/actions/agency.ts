"use server";

import { and, desc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import {
	type AgencyMember,
	agencyMembers,
	employers,
	type JobMandate,
	jobMandates,
	jobs,
	users,
} from "@/db/schema";
import { sendTransactionalMail } from "@/lib/mail/send";
import { transactionalEmail } from "@/lib/mail/templates";

async function requireOwnerOf(
	employerId: string,
): Promise<{ userId: string; employerId: string }> {
	const session = await auth();
	if (!session?.user?.id) throw new Error("unauthenticated");
	// The original employer.userId IS the owner — bootstrap row.
	const [emp] = await db
		.select()
		.from(employers)
		.where(eq(employers.id, employerId))
		.limit(1);
	if (!emp) throw new Error("not found");
	if (emp.userId === session.user.id) {
		return { userId: session.user.id, employerId };
	}
	const [member] = await db
		.select()
		.from(agencyMembers)
		.where(
			and(
				eq(agencyMembers.employerId, employerId),
				eq(agencyMembers.userId, session.user.id),
				eq(agencyMembers.role, "owner"),
			),
		)
		.limit(1);
	if (!member) throw new Error("not authorised");
	return { userId: session.user.id, employerId };
}

async function requireMyEmployer(): Promise<{
	userId: string;
	employerId: string;
}> {
	const session = await auth();
	if (!session?.user?.id) throw new Error("unauthenticated");
	const [emp] = await db
		.select()
		.from(employers)
		.where(eq(employers.userId, session.user.id))
		.limit(1);
	if (emp) return { userId: session.user.id, employerId: emp.id };
	// Member via agencyMembers
	const [member] = await db
		.select()
		.from(agencyMembers)
		.where(
			and(
				eq(agencyMembers.userId, session.user.id),
				isNull(agencyMembers.joinedAt) ? undefined : undefined,
			),
		)
		.limit(1);
	if (!member?.employerId) throw new Error("no employer");
	return { userId: session.user.id, employerId: member.employerId };
}

function generateToken(): string {
	const bytes = new Uint8Array(24);
	crypto.getRandomValues(bytes);
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

// Plattform-Regel: Max 2 Owner pro Firma. Wer einlädt, muss selbst Owner
// sein. So bleibt die Verantwortung für neue User-Konten klein und
// kontrolliert — die Firma kann zu zweit organisiert sein, kein Wildwuchs.
const MAX_OWNERS_PER_EMPLOYER = 2;

export async function inviteAgent(input: {
	email: string;
	role: "owner" | "recruiter" | "viewer";
}): Promise<{ id: string; inviteUrl: string }> {
	const { userId, employerId } = await requireMyEmployer();
	await requireOwnerOf(employerId);

	const email = input.email.trim().toLowerCase();
	if (!email.includes("@")) throw new Error("invalid email");

	// Owner-Cap: max 2 pro Firma. Wenn die neue Einladung Owner-Rolle
	// hätte und bereits 2 Owner existieren, ablehnen.
	if (input.role === "owner") {
		const owners = await db
			.select({ id: agencyMembers.id, email: agencyMembers.inviteEmail })
			.from(agencyMembers)
			.where(
				and(
					eq(agencyMembers.employerId, employerId),
					eq(agencyMembers.role, "owner"),
				),
			);
		// Existierender Owner mit gleicher Mail = OK (Idempotenz-Upsert);
		// neue Mail bei Cap = Reject.
		const alreadyOwner = owners.some((o) => o.email === email);
		if (!alreadyOwner && owners.length >= MAX_OWNERS_PER_EMPLOYER) {
			throw new Error(
				`Maximal ${MAX_OWNERS_PER_EMPLOYER} Owner pro Firma. Bitte erst einen bestehenden Owner zum Recruiter herabstufen.`,
			);
		}
	}

	const token = generateToken();
	const [created] = await db
		.insert(agencyMembers)
		.values({
			employerId,
			inviteEmail: email,
			inviteToken: token,
			role: input.role,
			invitedByUserId: userId,
		})
		.onConflictDoUpdate({
			target: [agencyMembers.employerId, agencyMembers.inviteEmail],
			set: {
				inviteToken: token,
				role: input.role,
				invitedAt: new Date(),
				invitedByUserId: userId,
			},
		})
		.returning({ id: agencyMembers.id });

	const [emp] = await db
		.select({ name: employers.companyName })
		.from(employers)
		.where(eq(employers.id, employerId))
		.limit(1);
	const baseUrl = process.env.AUTH_URL ?? "https://raza.work";
	const inviteUrl = `${baseUrl}/agency/invites/${token}`;

	const tpl = transactionalEmail({
		subject: `${emp?.name ?? "Klick"} hat dich ins Recruiter-Team eingeladen`,
		eyebrow: "Team-Einladung",
		title: "Du wurdest eingeladen",
		body: `<p>${emp?.name ?? "Eine Agentur"} möchte dich als <strong>${input.role}</strong> ins Klick-Team aufnehmen. Du erhältst Zugriff auf Stellen, Kandidat:innen und Verhandlungen.</p>`,
		cta: { label: "Einladung annehmen", url: inviteUrl },
		footnote:
			"Wenn du nicht weißt, worum es geht, ignoriere diese Mail einfach.",
	});

	await sendTransactionalMail({
		to: email,
		subject: tpl.subject,
		text: tpl.text,
		html: tpl.html,
	});

	revalidatePath("/agency/team");
	return { id: created.id, inviteUrl };
}

export async function acceptInvite(token: string): Promise<{
	employerId: string;
}> {
	const session = await auth();
	if (!session?.user?.id) throw new Error("unauthenticated");
	const [member] = await db
		.select()
		.from(agencyMembers)
		.where(eq(agencyMembers.inviteToken, token))
		.limit(1);
	if (!member) throw new Error("invalid token");
	if (member.userId && member.joinedAt) {
		return { employerId: member.employerId };
	}

	// Verify the logged-in user owns the invite email — prevents stealing
	// another inbox's invite if someone accidentally pasted the link.
	const [me] = await db
		.select({ email: users.email })
		.from(users)
		.where(eq(users.id, session.user.id))
		.limit(1);
	if (
		!me?.email ||
		me.email.trim().toLowerCase() !== member.inviteEmail.trim().toLowerCase()
	) {
		throw new Error("invite_email_mismatch");
	}

	await db
		.update(agencyMembers)
		.set({
			userId: session.user.id,
			joinedAt: new Date(),
			inviteToken: null,
		})
		.where(eq(agencyMembers.id, member.id));

	// Promote the user's role to "employer" so they get access to the
	// employer-side UI.
	await db
		.update(users)
		.set({ role: "employer" })
		.where(eq(users.id, session.user.id));

	revalidatePath("/agency/team");
	return { employerId: member.employerId };
}

export async function removeAgent(memberId: string): Promise<void> {
	const session = await auth();
	if (!session?.user?.id) throw new Error("unauthenticated");
	const [m] = await db
		.select()
		.from(agencyMembers)
		.where(eq(agencyMembers.id, memberId))
		.limit(1);
	if (!m) throw new Error("not found");
	await requireOwnerOf(m.employerId);
	if (m.role === "owner") {
		// Owner kann nicht direkt entfernt werden — sonst hätte die Firma
		// niemanden mehr, der einladen darf. Erst herabstufen.
		throw new Error(
			"Owner kann nicht direkt entfernt werden — erst zum Recruiter herabstufen.",
		);
	}
	await db.delete(agencyMembers).where(eq(agencyMembers.id, memberId));
	revalidatePath("/agency/team");
}

export async function promoteMember(
	memberId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	try {
		const session = await auth();
		if (!session?.user?.id) return { ok: false, error: "unauthenticated" };
		const [m] = await db
			.select()
			.from(agencyMembers)
			.where(eq(agencyMembers.id, memberId))
			.limit(1);
		if (!m) return { ok: false, error: "not found" };
		await requireOwnerOf(m.employerId);
		if (m.role === "owner") return { ok: true }; // bereits owner
		// Cap-Check
		const owners = await db
			.select({ id: agencyMembers.id })
			.from(agencyMembers)
			.where(
				and(
					eq(agencyMembers.employerId, m.employerId),
					eq(agencyMembers.role, "owner"),
				),
			);
		if (owners.length >= MAX_OWNERS_PER_EMPLOYER) {
			return {
				ok: false,
				error: `Maximal ${MAX_OWNERS_PER_EMPLOYER} Owner pro Firma. Stufe erst einen aktuellen Owner herab.`,
			};
		}
		await db
			.update(agencyMembers)
			.set({ role: "owner" })
			.where(eq(agencyMembers.id, memberId));
		revalidatePath("/agency/team");
		return { ok: true };
	} catch (e) {
		return {
			ok: false,
			error: e instanceof Error ? e.message : "fehlgeschlagen",
		};
	}
}

export async function demoteMember(
	memberId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	try {
		const session = await auth();
		if (!session?.user?.id) return { ok: false, error: "unauthenticated" };
		const [m] = await db
			.select()
			.from(agencyMembers)
			.where(eq(agencyMembers.id, memberId))
			.limit(1);
		if (!m) return { ok: false, error: "not found" };
		await requireOwnerOf(m.employerId);
		if (m.role !== "owner") {
			// Setze auf "recruiter" als sicheren Default für Nicht-Owner-Demote.
			await db
				.update(agencyMembers)
				.set({ role: "recruiter" })
				.where(eq(agencyMembers.id, memberId));
			revalidatePath("/agency/team");
			return { ok: true };
		}
		// Owner darf nur dann demoted werden, wenn mindestens ein zweiter
		// Owner übrig bleibt — sonst hätte die Firma niemanden mehr, der
		// einladen darf.
		const otherOwners = await db
			.select({ id: agencyMembers.id })
			.from(agencyMembers)
			.where(
				and(
					eq(agencyMembers.employerId, m.employerId),
					eq(agencyMembers.role, "owner"),
				),
			);
		if (otherOwners.length <= 1) {
			return {
				ok: false,
				error:
					"Mindestens 1 Owner muss bestehen bleiben. Befördere zuerst einen anderen Member.",
			};
		}
		await db
			.update(agencyMembers)
			.set({ role: "recruiter" })
			.where(eq(agencyMembers.id, memberId));
		revalidatePath("/agency/team");
		return { ok: true };
	} catch (e) {
		return {
			ok: false,
			error: e instanceof Error ? e.message : "fehlgeschlagen",
		};
	}
}

export async function getOwnerCount(): Promise<{
	count: number;
	max: number;
	isFull: boolean;
}> {
	try {
		const { employerId } = await requireMyEmployer();
		const owners = await db
			.select({ id: agencyMembers.id })
			.from(agencyMembers)
			.where(
				and(
					eq(agencyMembers.employerId, employerId),
					eq(agencyMembers.role, "owner"),
				),
			);
		const count = owners.length;
		return {
			count,
			max: MAX_OWNERS_PER_EMPLOYER,
			isFull: count >= MAX_OWNERS_PER_EMPLOYER,
		};
	} catch {
		return { count: 0, max: MAX_OWNERS_PER_EMPLOYER, isFull: false };
	}
}

export async function listAgents(): Promise<{
	owner: { userId: string; email: string | null; name: string | null };
	members: AgencyMember[];
}> {
	const { employerId } = await requireMyEmployer();
	const [emp] = await db
		.select({
			userId: employers.userId,
			email: users.email,
			name: users.name,
		})
		.from(employers)
		.leftJoin(users, eq(users.id, employers.userId))
		.where(eq(employers.id, employerId))
		.limit(1);

	const members = await db
		.select()
		.from(agencyMembers)
		.where(eq(agencyMembers.employerId, employerId))
		.orderBy(desc(agencyMembers.invitedAt));

	return {
		owner: {
			userId: emp?.userId ?? "",
			email: emp?.email ?? null,
			name: emp?.name ?? null,
		},
		members,
	};
}

// ─── Job Mandates ──────────────────────────────────────────────────────────

export async function setJobMandate(input: {
	jobId: string;
	clientName: string;
	clientWebsite?: string;
	clientIndustry?: string;
	clientNote?: string;
	clientVisibility: "private" | "anonymous" | "named";
	commissionPct?: number;
}): Promise<void> {
	const { employerId } = await requireMyEmployer();
	const [job] = await db
		.select()
		.from(jobs)
		.where(eq(jobs.id, input.jobId))
		.limit(1);
	if (!job || job.employerId !== employerId) throw new Error("not yours");

	const values = {
		jobId: input.jobId,
		clientName: input.clientName.trim(),
		clientWebsite: input.clientWebsite?.trim() || null,
		clientIndustry: input.clientIndustry?.trim() || null,
		clientNote: input.clientNote?.trim() || null,
		clientVisibility: input.clientVisibility,
		commissionPct: input.commissionPct ?? null,
		updatedAt: new Date(),
	};

	await db
		.insert(jobMandates)
		.values(values)
		.onConflictDoUpdate({ target: jobMandates.jobId, set: values });

	revalidatePath(`/jobs/${input.jobId}`);
	revalidatePath(`/jobs/browse/${input.jobId}`);
}

export async function getJobMandate(jobId: string): Promise<JobMandate | null> {
	const [m] = await db
		.select()
		.from(jobMandates)
		.where(eq(jobMandates.jobId, jobId))
		.limit(1);
	return m ?? null;
}

export async function deleteJobMandate(jobId: string): Promise<void> {
	const { employerId } = await requireMyEmployer();
	const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
	if (!job || job.employerId !== employerId) throw new Error("not yours");
	await db.delete(jobMandates).where(eq(jobMandates.jobId, jobId));
	revalidatePath(`/jobs/${jobId}`);
}
