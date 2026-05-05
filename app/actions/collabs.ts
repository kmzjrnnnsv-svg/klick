"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import {
	type AgencyCollaboration,
	agencyCollaborations,
	type CollaborationCandidateProposal,
	candidateProfiles,
	collaborationCandidateProposals,
	commissionEvents,
	employers,
	interests,
	jobs,
	users,
} from "@/db/schema";
import { sendTransactionalMail } from "@/lib/mail/send";
import { transactionalEmail } from "@/lib/mail/templates";
import { pushNotification } from "./notifications";

async function requireMyAgency(): Promise<{
	userId: string;
	agencyId: string;
}> {
	const session = await auth();
	if (!session?.user?.id) throw new Error("unauthenticated");
	const [emp] = await db
		.select()
		.from(employers)
		.where(eq(employers.userId, session.user.id))
		.limit(1);
	if (!emp) throw new Error("no employer");
	return { userId: session.user.id, agencyId: emp.id };
}

function generateToken(): string {
	const bytes = new Uint8Array(24);
	crypto.getRandomValues(bytes);
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

// ─── Lead-Agency: Collab einladen ──────────────────────────────────────────

export async function inviteCollaboration(input: {
	jobId: string;
	partnerEmail: string;
	leadCommissionPct: number;
	partnerCommissionPct: number;
	scope?: string;
}): Promise<{ id: string }> {
	const { agencyId } = await requireMyAgency();
	if (input.leadCommissionPct + input.partnerCommissionPct !== 100) {
		throw new Error("commission_pct_must_sum_to_100");
	}
	const [job] = await db
		.select({ id: jobs.id, title: jobs.title, employerId: jobs.employerId })
		.from(jobs)
		.where(eq(jobs.id, input.jobId))
		.limit(1);
	if (!job || job.employerId !== agencyId) throw new Error("not_your_job");

	const partnerEmail = input.partnerEmail.trim().toLowerCase();
	if (!partnerEmail.includes("@")) throw new Error("invalid_email");

	// If the email belongs to a registered employer, link it directly.
	const [partnerUser] = await db
		.select({ employerId: employers.id })
		.from(employers)
		.innerJoin(users, eq(users.id, employers.userId))
		.where(eq(users.email, partnerEmail))
		.limit(1);

	const token = generateToken();
	const [created] = await db
		.insert(agencyCollaborations)
		.values({
			jobId: input.jobId,
			leadAgencyId: agencyId,
			partnerAgencyId: partnerUser?.employerId ?? null,
			partnerEmail,
			partnerInviteToken: token,
			leadCommissionPct: input.leadCommissionPct,
			partnerCommissionPct: input.partnerCommissionPct,
			scope: input.scope?.trim() ?? null,
		})
		.onConflictDoUpdate({
			target: [agencyCollaborations.jobId, agencyCollaborations.partnerEmail],
			set: {
				partnerInviteToken: token,
				leadCommissionPct: input.leadCommissionPct,
				partnerCommissionPct: input.partnerCommissionPct,
				scope: input.scope?.trim() ?? null,
				status: "pending",
			},
		})
		.returning({ id: agencyCollaborations.id });

	const [lead] = await db
		.select({ name: employers.companyName })
		.from(employers)
		.where(eq(employers.id, agencyId))
		.limit(1);

	const baseUrl = process.env.AUTH_URL ?? "https://raza.work";
	const url = `${baseUrl}/agency/collabs/invites/${token}`;
	const tpl = transactionalEmail({
		subject: `${lead?.name ?? "Eine Agentur"} schlägt eine Vermittlungs-Partnerschaft vor`,
		eyebrow: "Partner-Anfrage",
		title: "Stelle gemeinsam vermitteln",
		body: `<p>${lead?.name ?? "Eine Agentur"} hat das Mandat für <strong>${job.title}</strong> und möchte mit dir gemeinsam vermitteln. Konditionen: ${input.leadCommissionPct}% bei der Lead-Agency, ${input.partnerCommissionPct}% bei dir.</p>`,
		cta: { label: "Anfrage prüfen", url },
		footnote:
			"Wenn du die Stelle nicht kennst oder den Vorschlag nicht möchtest, ignoriere diese Mail.",
	});

	await sendTransactionalMail({
		to: partnerEmail,
		subject: tpl.subject,
		text: tpl.text,
		html: tpl.html,
	});

	revalidatePath(`/jobs/${input.jobId}/collabs`);
	return { id: created.id };
}

// ─── Partner-Agency: Annehmen / Ablehnen ──────────────────────────────────

export async function getCollabByToken(
	token: string,
): Promise<AgencyCollaboration | null> {
	const [r] = await db
		.select()
		.from(agencyCollaborations)
		.where(eq(agencyCollaborations.partnerInviteToken, token))
		.limit(1);
	return r ?? null;
}

export async function acceptCollaboration(token: string): Promise<{
	collaborationId: string;
	jobId: string;
}> {
	const { userId, agencyId } = await requireMyAgency();
	const [c] = await db
		.select()
		.from(agencyCollaborations)
		.where(eq(agencyCollaborations.partnerInviteToken, token))
		.limit(1);
	if (!c) throw new Error("invalid_token");
	if (c.status !== "pending") throw new Error("not_pending");

	// Email-Match-Check: nur der eingeladene User darf annehmen.
	const [me] = await db
		.select({ email: users.email })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	if (
		!me?.email ||
		me.email.trim().toLowerCase() !== c.partnerEmail.trim().toLowerCase()
	) {
		throw new Error("invite_email_mismatch");
	}
	if (c.leadAgencyId === agencyId) throw new Error("cannot_partner_with_self");

	await db
		.update(agencyCollaborations)
		.set({
			partnerAgencyId: agencyId,
			partnerInviteToken: null,
			status: "active",
			startedAt: new Date(),
		})
		.where(eq(agencyCollaborations.id, c.id));

	const [lead] = await db
		.select({ userId: employers.userId, name: employers.companyName })
		.from(employers)
		.where(eq(employers.id, c.leadAgencyId))
		.limit(1);
	if (lead) {
		await pushNotification({
			userId: lead.userId,
			kind: "system",
			title: "Partner-Agency hat angenommen",
			body: "Sie können jetzt Kandidaten zur Stelle vorschlagen.",
			link: `/jobs/${c.jobId}/collabs`,
		});
	}

	revalidatePath(`/jobs/${c.jobId}/collabs`);
	revalidatePath("/agency/collabs");
	return { collaborationId: c.id, jobId: c.jobId };
}

export async function rejectCollaboration(token: string): Promise<void> {
	const { userId } = await requireMyAgency();
	const [c] = await db
		.select()
		.from(agencyCollaborations)
		.where(eq(agencyCollaborations.partnerInviteToken, token))
		.limit(1);
	if (!c) return;
	const [me] = await db
		.select({ email: users.email })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	if (me?.email?.toLowerCase() !== c.partnerEmail.toLowerCase())
		throw new Error("invite_email_mismatch");
	await db
		.update(agencyCollaborations)
		.set({ status: "rejected", endedAt: new Date(), partnerInviteToken: null })
		.where(eq(agencyCollaborations.id, c.id));
	revalidatePath("/agency/collabs");
}

export async function endCollaboration(collabId: string): Promise<void> {
	const { agencyId } = await requireMyAgency();
	const [c] = await db
		.select()
		.from(agencyCollaborations)
		.where(eq(agencyCollaborations.id, collabId))
		.limit(1);
	if (!c) throw new Error("not_found");
	if (c.leadAgencyId !== agencyId && c.partnerAgencyId !== agencyId)
		throw new Error("not_authorized");
	await db
		.update(agencyCollaborations)
		.set({ status: "ended", endedAt: new Date() })
		.where(eq(agencyCollaborations.id, collabId));
	revalidatePath(`/jobs/${c.jobId}/collabs`);
	revalidatePath("/agency/collabs");
}

// ─── Listing ──────────────────────────────────────────────────────────────

export async function listCollabsForJob(
	jobId: string,
): Promise<AgencyCollaboration[]> {
	const { agencyId } = await requireMyAgency();
	const [job] = await db
		.select({ employerId: jobs.employerId })
		.from(jobs)
		.where(eq(jobs.id, jobId))
		.limit(1);
	if (!job || job.employerId !== agencyId) throw new Error("not_your_job");
	return db
		.select()
		.from(agencyCollaborations)
		.where(eq(agencyCollaborations.jobId, jobId))
		.orderBy(desc(agencyCollaborations.createdAt));
}

export type IncomingCollab = AgencyCollaboration & {
	jobTitle: string | null;
	leadAgencyName: string | null;
};

export async function listIncomingCollabs(): Promise<IncomingCollab[]> {
	const { agencyId } = await requireMyAgency();
	const rows = await db
		.select({
			c: agencyCollaborations,
			jobTitle: jobs.title,
			leadAgencyName: employers.companyName,
		})
		.from(agencyCollaborations)
		.leftJoin(jobs, eq(jobs.id, agencyCollaborations.jobId))
		.leftJoin(employers, eq(employers.id, agencyCollaborations.leadAgencyId))
		.where(eq(agencyCollaborations.partnerAgencyId, agencyId))
		.orderBy(desc(agencyCollaborations.createdAt));
	return rows.map((r) => ({
		...r.c,
		jobTitle: r.jobTitle,
		leadAgencyName: r.leadAgencyName,
	}));
}

// ─── Partner: Kandidat vorschlagen ─────────────────────────────────────────

export async function proposeCandidate(input: {
	collaborationId: string;
	candidateUserId: string;
	note?: string;
}): Promise<{ id: string }> {
	const { userId, agencyId } = await requireMyAgency();
	const [c] = await db
		.select()
		.from(agencyCollaborations)
		.where(eq(agencyCollaborations.id, input.collaborationId))
		.limit(1);
	if (!c) throw new Error("not_found");
	if (c.partnerAgencyId !== agencyId) throw new Error("not_partner");
	if (c.status !== "active") throw new Error("collab_not_active");

	// Conflict-of-Interest-Check: ist der Kandidat schon im direkten Pitch
	// der Lead-Agency? Dann blocken.
	const [conflictRow] = await db
		.select({ id: interests.id })
		.from(interests)
		.where(
			and(
				eq(interests.candidateUserId, input.candidateUserId),
				eq(interests.jobId, c.jobId),
			),
		)
		.limit(1);
	if (conflictRow) throw new Error("conflict_already_in_direct_pitch");

	const [created] = await db
		.insert(collaborationCandidateProposals)
		.values({
			collaborationId: input.collaborationId,
			candidateUserId: input.candidateUserId,
			proposedByUserId: userId,
			note: input.note?.trim() ?? null,
		})
		.onConflictDoUpdate({
			target: [
				collaborationCandidateProposals.collaborationId,
				collaborationCandidateProposals.candidateUserId,
			],
			set: {
				note: input.note?.trim() ?? null,
				proposedAt: new Date(),
			},
		})
		.returning({ id: collaborationCandidateProposals.id });

	const [lead] = await db
		.select({ userId: employers.userId, name: employers.companyName })
		.from(employers)
		.where(eq(employers.id, c.leadAgencyId))
		.limit(1);
	const [cand] = await db
		.select({ name: candidateProfiles.displayName })
		.from(candidateProfiles)
		.where(eq(candidateProfiles.userId, input.candidateUserId))
		.limit(1);
	if (lead) {
		await pushNotification({
			userId: lead.userId,
			kind: "system",
			title: `Neuer Kandidaten-Vorschlag von Partner`,
			body: `${cand?.name ?? "Kandidat:in"} wurde via Partner-Vermittlung vorgeschlagen.`,
			link: `/jobs/${c.jobId}/collabs/${c.id}`,
		});
	}

	revalidatePath(`/jobs/${c.jobId}/collabs/${c.id}`);
	return { id: created.id };
}

export async function listProposalsForCollab(collabId: string): Promise<
	Array<
		CollaborationCandidateProposal & {
			candidateName: string | null;
		}
	>
> {
	const { agencyId } = await requireMyAgency();
	const [c] = await db
		.select()
		.from(agencyCollaborations)
		.where(eq(agencyCollaborations.id, collabId))
		.limit(1);
	if (!c) return [];
	if (c.leadAgencyId !== agencyId && c.partnerAgencyId !== agencyId)
		throw new Error("not_authorized");
	const rows = await db
		.select({
			p: collaborationCandidateProposals,
			candidateName: candidateProfiles.displayName,
		})
		.from(collaborationCandidateProposals)
		.leftJoin(
			candidateProfiles,
			eq(
				candidateProfiles.userId,
				collaborationCandidateProposals.candidateUserId,
			),
		)
		.where(eq(collaborationCandidateProposals.collaborationId, collabId))
		.orderBy(desc(collaborationCandidateProposals.proposedAt));
	return rows.map((r) => ({ ...r.p, candidateName: r.candidateName }));
}

export async function setProposalStatus(input: {
	proposalId: string;
	status: "shortlisted" | "rejected" | "hired";
}): Promise<void> {
	const { agencyId } = await requireMyAgency();
	const [p] = await db
		.select()
		.from(collaborationCandidateProposals)
		.where(eq(collaborationCandidateProposals.id, input.proposalId))
		.limit(1);
	if (!p) throw new Error("not_found");
	const [c] = await db
		.select()
		.from(agencyCollaborations)
		.where(eq(agencyCollaborations.id, p.collaborationId))
		.limit(1);
	if (!c || c.leadAgencyId !== agencyId)
		throw new Error("only_lead_can_decide");
	await db
		.update(collaborationCandidateProposals)
		.set({ status: input.status })
		.where(eq(collaborationCandidateProposals.id, input.proposalId));
	revalidatePath(`/jobs/${c.jobId}/collabs/${c.id}`);
}

// ─── Provisions-Tracking ──────────────────────────────────────────────────

// Wird von outcomes-action gerufen, wenn ein "hired" für einen Kandidaten
// reportet wird, der via Partner-Vorschlag in den Pool kam.
export async function recordCommissionFromOutcome(input: {
	jobId: string;
	candidateUserId: string;
	totalCommissionEur: number;
}): Promise<void> {
	// Find any active collab for this job + a proposal for the candidate.
	const [hit] = await db
		.select({
			collab: agencyCollaborations,
			proposal: collaborationCandidateProposals,
		})
		.from(collaborationCandidateProposals)
		.innerJoin(
			agencyCollaborations,
			eq(
				agencyCollaborations.id,
				collaborationCandidateProposals.collaborationId,
			),
		)
		.where(
			and(
				eq(agencyCollaborations.jobId, input.jobId),
				eq(
					collaborationCandidateProposals.candidateUserId,
					input.candidateUserId,
				),
			),
		)
		.limit(1);
	if (!hit) return;

	const total = Math.max(0, input.totalCommissionEur);
	const partnerAmount = Math.round(
		(total * hit.collab.partnerCommissionPct) / 100,
	);
	const leadAmount = total - partnerAmount;

	await db.insert(commissionEvents).values({
		collaborationId: hit.collab.id,
		candidateUserId: input.candidateUserId,
		totalCommissionEur: total,
		leadAmountEur: leadAmount,
		partnerAmountEur: partnerAmount,
	});
	await db
		.update(collaborationCandidateProposals)
		.set({ status: "hired" })
		.where(eq(collaborationCandidateProposals.id, hit.proposal.id));
}
