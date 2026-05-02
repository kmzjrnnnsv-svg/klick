"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import {
	candidateProfiles,
	employers,
	jobs,
	type Offer,
	offers,
	users,
} from "@/db/schema";
import { sendTransactionalMail } from "@/lib/mail/send";
import { pushNotification } from "./notifications";

async function requireEmployerWithRow() {
	const session = await auth();
	if (!session?.user?.id) throw new Error("unauthenticated");
	const [u] = await db
		.select({ role: users.role })
		.from(users)
		.where(eq(users.id, session.user.id))
		.limit(1);
	if (u?.role !== "employer") throw new Error("forbidden");
	const [emp] = await db
		.select()
		.from(employers)
		.where(eq(employers.userId, session.user.id))
		.limit(1);
	if (!emp) throw new Error("no employer profile");
	return { userId: session.user.id, employer: emp };
}

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

export async function makeOffer(input: {
	jobId: string;
	candidateUserId: string;
	roleTitle: string;
	salaryProposed: number;
	startDateProposed?: string; // ISO
	message?: string;
}): Promise<{ id: string }> {
	const { employer } = await requireEmployerWithRow();

	const [job] = await db
		.select()
		.from(jobs)
		.where(eq(jobs.id, input.jobId))
		.limit(1);
	if (!job || job.employerId !== employer.id) throw new Error("job not yours");

	// Check candidate's contactability preference. Headhunter (isAgency) is
	// blocked when the candidate set "employers_only".
	const [profile] = await db
		.select({
			canBeContactedBy: candidateProfiles.canBeContactedBy,
			openToOffers: candidateProfiles.openToOffers,
			displayName: candidateProfiles.displayName,
		})
		.from(candidateProfiles)
		.where(eq(candidateProfiles.userId, input.candidateUserId))
		.limit(1);
	if (!profile) throw new Error("candidate not found");
	if (profile.canBeContactedBy === "none" || !profile.openToOffers) {
		throw new Error("candidate not accepting offers");
	}
	if (profile.canBeContactedBy === "employers_only" && employer.isAgency) {
		throw new Error("candidate accepts offers from direct employers only");
	}

	const expiresAt = new Date();
	expiresAt.setDate(expiresAt.getDate() + 14);

	const [created] = await db
		.insert(offers)
		.values({
			jobId: input.jobId,
			employerId: employer.id,
			candidateUserId: input.candidateUserId,
			roleTitle: input.roleTitle,
			salaryProposed: input.salaryProposed,
			startDateProposed: input.startDateProposed
				? new Date(input.startDateProposed)
				: null,
			message: input.message,
			lastActor: "employer",
			expiresAt,
		})
		.returning({ id: offers.id });

	await pushNotification({
		userId: input.candidateUserId,
		kind: "new_offer",
		title: `${employer.companyName} hat dir ein Angebot gemacht`,
		body: `${input.roleTitle} — ${input.salaryProposed.toLocaleString("de-DE")} €`,
		link: `/offers/${created.id}`,
		payload: {
			offerId: created.id,
			employerId: employer.id,
			jobId: input.jobId,
			roleTitle: input.roleTitle,
		},
	});

	// Best-effort mail (no-throw inside sendTransactionalMail).
	const [u] = await db
		.select({ email: users.email })
		.from(users)
		.where(eq(users.id, input.candidateUserId))
		.limit(1);
	if (u?.email) {
		await sendTransactionalMail({
			to: u.email,
			subject: `Neues Angebot: ${input.roleTitle}`,
			text: `${employer.companyName} hat dir ein Angebot gemacht.\n\nRolle: ${input.roleTitle}\nGehalt: ${input.salaryProposed.toLocaleString("de-DE")} €\n\n${input.message ?? ""}\n\nÖffne das Angebot in deinem Klick-Postfach.`,
		});
	}

	revalidatePath("/jobs");
	revalidatePath(`/jobs/${input.jobId}/candidates`);
	revalidatePath(`/jobs/${input.jobId}/favorites`);
	return { id: created.id };
}

export async function counterOffer(input: {
	parentOfferId: string;
	salaryProposed: number;
	message?: string;
}): Promise<{ id: string }> {
	const candidateId = await requireCandidate();
	const [parent] = await db
		.select()
		.from(offers)
		.where(eq(offers.id, input.parentOfferId))
		.limit(1);
	if (!parent || parent.candidateUserId !== candidateId)
		throw new Error("not found");
	if (parent.status !== "pending" && parent.status !== "seen")
		throw new Error("offer not in negotiable state");

	// Mark the parent as countered.
	await db
		.update(offers)
		.set({ status: "countered", decidedAt: new Date() })
		.where(eq(offers.id, parent.id));

	// Create the counter as a new offer pointing back to the parent.
	const [created] = await db
		.insert(offers)
		.values({
			jobId: parent.jobId,
			employerId: parent.employerId,
			candidateUserId: parent.candidateUserId,
			parentOfferId: parent.id,
			roleTitle: parent.roleTitle,
			salaryProposed: input.salaryProposed,
			startDateProposed: parent.startDateProposed,
			message: input.message,
			lastActor: "candidate",
			expiresAt: parent.expiresAt,
		})
		.returning({ id: offers.id });

	const [emp] = await db
		.select({ userId: employers.userId, name: employers.companyName })
		.from(employers)
		.where(eq(employers.id, parent.employerId))
		.limit(1);
	if (emp) {
		await pushNotification({
			userId: emp.userId,
			kind: "offer_decided",
			title: "Gegenangebot eingegangen",
			body: `Neuer Vorschlag: ${input.salaryProposed.toLocaleString("de-DE")} €`,
			link: `/jobs/${parent.jobId}/offers/${created.id}`,
			payload: { offerId: created.id, parentOfferId: parent.id },
		});
	}

	revalidatePath("/offers");
	revalidatePath(`/jobs/${parent.jobId}/offers`);
	return { id: created.id };
}

export async function respondToOffer(input: {
	offerId: string;
	decision: "accepted" | "declined";
	message?: string;
}): Promise<void> {
	const candidateId = await requireCandidate();
	const [o] = await db
		.select()
		.from(offers)
		.where(eq(offers.id, input.offerId))
		.limit(1);
	if (!o || o.candidateUserId !== candidateId) throw new Error("not found");
	if (o.status !== "pending" && o.status !== "seen")
		throw new Error("offer not pending");

	await db
		.update(offers)
		.set({
			status: input.decision,
			decidedAt: new Date(),
			decidedMessage: input.message,
		})
		.where(eq(offers.id, o.id));

	const [emp] = await db
		.select({ userId: employers.userId, name: employers.companyName })
		.from(employers)
		.where(eq(employers.id, o.employerId))
		.limit(1);
	if (emp) {
		await pushNotification({
			userId: emp.userId,
			kind: "offer_decided",
			title:
				input.decision === "accepted"
					? `Angebot angenommen: ${o.roleTitle}`
					: `Angebot abgelehnt: ${o.roleTitle}`,
			body: input.message,
			link: `/jobs/${o.jobId}/offers/${o.id}`,
			payload: { offerId: o.id, decision: input.decision },
		});
	}

	revalidatePath("/offers");
	revalidatePath(`/offers/${o.id}`);
}

export async function withdrawOffer(offerId: string): Promise<void> {
	const { employer } = await requireEmployerWithRow();
	const [o] = await db
		.select()
		.from(offers)
		.where(eq(offers.id, offerId))
		.limit(1);
	if (!o || o.employerId !== employer.id) throw new Error("not found");
	if (o.status !== "pending" && o.status !== "seen")
		throw new Error("offer not withdrawable");
	await db
		.update(offers)
		.set({ status: "withdrawn", decidedAt: new Date() })
		.where(eq(offers.id, offerId));
	revalidatePath(`/jobs/${o.jobId}/offers`);
}

export async function markOfferSeen(offerId: string): Promise<void> {
	const candidateId = await requireCandidate();
	const [o] = await db
		.select()
		.from(offers)
		.where(eq(offers.id, offerId))
		.limit(1);
	if (!o || o.candidateUserId !== candidateId) return;
	if (o.status === "pending") {
		await db
			.update(offers)
			.set({ status: "seen" })
			.where(eq(offers.id, offerId));
	}
}

export type OfferForCandidate = {
	offer: Offer;
	employer: { id: string; name: string; isAgency: boolean };
	job: { id: string; title: string; location: string | null };
};

export async function listOffersForCandidate(): Promise<OfferForCandidate[]> {
	const candidateId = await requireCandidate();
	const rows = await db
		.select({
			offer: offers,
			employerId: employers.id,
			employerName: employers.companyName,
			isAgency: employers.isAgency,
			jobId: jobs.id,
			jobTitle: jobs.title,
			jobLocation: jobs.location,
		})
		.from(offers)
		.leftJoin(employers, eq(employers.id, offers.employerId))
		.leftJoin(jobs, eq(jobs.id, offers.jobId))
		.where(eq(offers.candidateUserId, candidateId))
		.orderBy(desc(offers.createdAt));
	return rows.map((r) => ({
		offer: r.offer,
		employer: {
			id: r.employerId ?? "",
			name: r.employerName ?? "Unbekannt",
			isAgency: r.isAgency ?? false,
		},
		job: {
			id: r.jobId ?? "",
			title: r.jobTitle ?? "",
			location: r.jobLocation,
		},
	}));
}

export async function getOfferForCandidate(
	id: string,
): Promise<OfferForCandidate | null> {
	const candidateId = await requireCandidate();
	const [r] = await db
		.select({
			offer: offers,
			employerId: employers.id,
			employerName: employers.companyName,
			isAgency: employers.isAgency,
			jobId: jobs.id,
			jobTitle: jobs.title,
			jobLocation: jobs.location,
		})
		.from(offers)
		.leftJoin(employers, eq(employers.id, offers.employerId))
		.leftJoin(jobs, eq(jobs.id, offers.jobId))
		.where(and(eq(offers.id, id), eq(offers.candidateUserId, candidateId)))
		.limit(1);
	if (!r) return null;
	return {
		offer: r.offer,
		employer: {
			id: r.employerId ?? "",
			name: r.employerName ?? "Unbekannt",
			isAgency: r.isAgency ?? false,
		},
		job: {
			id: r.jobId ?? "",
			title: r.jobTitle ?? "",
			location: r.jobLocation,
		},
	};
}

export async function listOffersForEmployer(jobId?: string): Promise<Offer[]> {
	const { employer } = await requireEmployerWithRow();
	const where = jobId
		? and(eq(offers.employerId, employer.id), eq(offers.jobId, jobId))
		: eq(offers.employerId, employer.id);
	return db.select().from(offers).where(where).orderBy(desc(offers.createdAt));
}

// Negotiation chain — collects every offer linked by parentOfferId.
// Returns oldest → newest so the UI can render a timeline.
export async function getOfferThread(rootOfferId: string): Promise<Offer[]> {
	// Walk up to the absolute root, then collect descendants.
	const seen = new Set<string>();
	const collected: Offer[] = [];
	let cursor: string | null = rootOfferId;

	while (cursor && !seen.has(cursor)) {
		seen.add(cursor);
		const [row] = await db
			.select()
			.from(offers)
			.where(eq(offers.id, cursor))
			.limit(1);
		if (!row) break;
		collected.unshift(row);
		cursor = row.parentOfferId;
	}

	// Walk down: find any offer whose parentOfferId is the most recent
	// collected. Loop until none.
	let lastIdNorm: string = collected[collected.length - 1]?.id ?? rootOfferId;
	while (true) {
		const [child] = await db
			.select()
			.from(offers)
			.where(eq(offers.parentOfferId, lastIdNorm))
			.limit(1);
		if (!child || seen.has(child.id)) break;
		seen.add(child.id);
		collected.push(child);
		lastIdNorm = child.id;
	}

	return collected;
}

// Employer accepts the candidate's most recent counter — closes negotiation.
export async function acceptCounter(offerId: string): Promise<void> {
	const { employer } = await requireEmployerWithRow();
	const [o] = await db
		.select()
		.from(offers)
		.where(eq(offers.id, offerId))
		.limit(1);
	if (!o || o.employerId !== employer.id) throw new Error("not found");
	if (
		o.lastActor !== "candidate" ||
		(o.status !== "pending" && o.status !== "seen")
	) {
		throw new Error("offer not in counter state");
	}
	await db
		.update(offers)
		.set({ status: "accepted", decidedAt: new Date() })
		.where(eq(offers.id, offerId));

	await pushNotification({
		userId: o.candidateUserId,
		kind: "offer_decided",
		title: `Angebot angenommen: ${o.roleTitle}`,
		body: `${employer.companyName} akzeptiert deinen Vorschlag von ${o.salaryProposed.toLocaleString("de-DE")} €.`,
		link: `/offers/${o.id}`,
		payload: { offerId: o.id },
	});

	revalidatePath("/offers");
	revalidatePath(`/offers/${o.id}`);
	revalidatePath(`/jobs/${o.jobId}/offers`);
}

// Employer counters the candidate's counter — fresh offer in the chain.
export async function employerCounter(input: {
	parentOfferId: string;
	salaryProposed: number;
	message?: string;
}): Promise<{ id: string }> {
	const { employer } = await requireEmployerWithRow();
	const [parent] = await db
		.select()
		.from(offers)
		.where(eq(offers.id, input.parentOfferId))
		.limit(1);
	if (!parent || parent.employerId !== employer.id)
		throw new Error("not found");
	if (parent.lastActor !== "candidate") {
		throw new Error("can only counter a candidate's counter");
	}

	await db
		.update(offers)
		.set({ status: "countered", decidedAt: new Date() })
		.where(eq(offers.id, parent.id));

	const [created] = await db
		.insert(offers)
		.values({
			jobId: parent.jobId,
			employerId: parent.employerId,
			candidateUserId: parent.candidateUserId,
			parentOfferId: parent.id,
			roleTitle: parent.roleTitle,
			salaryProposed: input.salaryProposed,
			startDateProposed: parent.startDateProposed,
			message: input.message,
			lastActor: "employer",
			expiresAt: parent.expiresAt,
		})
		.returning({ id: offers.id });

	await pushNotification({
		userId: parent.candidateUserId,
		kind: "new_offer",
		title: `${employer.companyName} hat dein Gegenangebot beantwortet`,
		body: `Neuer Vorschlag: ${input.salaryProposed.toLocaleString("de-DE")} €`,
		link: `/offers/${created.id}`,
		payload: { offerId: created.id, parentOfferId: parent.id },
	});

	revalidatePath("/offers");
	revalidatePath(`/jobs/${parent.jobId}/offers`);
	return { id: created.id };
}

export type EmployerOfferDetail = {
	offer: Offer;
	candidate: {
		userId: string;
		displayName: string | null;
		email: string | null;
	};
	job: { id: string; title: string };
	thread: Offer[];
};

export async function getOfferForEmployer(
	id: string,
): Promise<EmployerOfferDetail | null> {
	const { employer } = await requireEmployerWithRow();
	const [r] = await db
		.select({
			offer: offers,
			candidateUserId: offers.candidateUserId,
			displayName: candidateProfiles.displayName,
			email: users.email,
			jobTitle: jobs.title,
		})
		.from(offers)
		.leftJoin(
			candidateProfiles,
			eq(candidateProfiles.userId, offers.candidateUserId),
		)
		.leftJoin(users, eq(users.id, offers.candidateUserId))
		.leftJoin(jobs, eq(jobs.id, offers.jobId))
		.where(and(eq(offers.id, id), eq(offers.employerId, employer.id)))
		.limit(1);
	if (!r) return null;
	const thread = await getOfferThread(id);
	return {
		offer: r.offer,
		candidate: {
			userId: r.candidateUserId,
			displayName: r.displayName,
			email: r.email,
		},
		job: { id: r.offer.jobId, title: r.jobTitle ?? "" },
		thread,
	};
}
