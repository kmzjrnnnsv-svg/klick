"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { recomputeInsights } from "@/app/actions/insights";
import { recomputeMatchesForCandidate } from "@/app/actions/matches";
import { auth } from "@/auth";
import { db } from "@/db";
import {
	type BadgeMeta,
	candidateProfiles,
	type ProfileEducation,
	type ProfileExperience,
	type ProfileSkill,
	users,
	type VaultItem,
	vaultItems,
} from "@/db/schema";
import { getAIProvider } from "@/lib/ai";
import {
	encryptBytes,
	generateDek,
	sha256Hex,
	unwrapDek,
	wrapDek,
} from "@/lib/crypto/envelope";
import { deleteObject, putBytes } from "@/lib/storage/s3";
import { detectKindFromFilename } from "@/lib/vault/detect-kind";

const VALID_KINDS = ["cv", "certificate", "badge", "id_doc", "other"] as const;
type Kind = (typeof VALID_KINDS)[number];

function pickKind(raw: FormDataEntryValue | null): Kind | null {
	const v = raw == null ? "" : String(raw).trim();
	if (!v) return null;
	return (VALID_KINDS as readonly string[]).includes(v) ? (v as Kind) : null;
}

async function ensureUserDek(userId: string): Promise<Uint8Array> {
	const [user] = await db
		.select({ encryptedDek: users.encryptedDek })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	if (!user) throw new Error("user not found");

	if (user.encryptedDek) {
		return unwrapDek(user.encryptedDek);
	}
	const dek = await generateDek();
	const wrapped = await wrapDek(dek);
	await db
		.update(users)
		.set({ encryptedDek: wrapped })
		.where(eq(users.id, userId));
	return dek;
}

export async function uploadVaultItem(formData: FormData): Promise<void> {
	const session = await auth();
	if (!session?.user?.id) throw new Error("unauthenticated");
	const userId = session.user.id;

	const file = formData.get("file");
	if (!(file instanceof File) || file.size === 0) {
		throw new Error("no file");
	}

	const mime = file.type || "application/octet-stream";
	// User-supplied kind (from upload-zone dropdown) wins; otherwise fall back
	// to filename heuristics so the user doesn't have to label every doc.
	const explicitKind = pickKind(formData.get("kind"));
	const detectedKind = detectKindFromFilename(file.name, mime);
	const kind: Kind = explicitKind ?? detectedKind;

	const tagsRaw = String(formData.get("tags") ?? "");
	const tags = tagsRaw
		.split(",")
		.map((t) => t.trim())
		.filter(Boolean);

	const dek = await ensureUserDek(userId);
	const plain = new Uint8Array(await file.arrayBuffer());
	const { ciphertext, nonce } = await encryptBytes(plain, dek);

	const storageKey = `${userId}/${crypto.randomUUID()}`;
	await putBytes(storageKey, ciphertext);
	const sha256 = await sha256Hex(ciphertext);

	const [inserted] = await db
		.insert(vaultItems)
		.values({
			userId,
			kind,
			filename: file.name,
			mime,
			sizeBytes: plain.length,
			storageKey,
			nonce: Buffer.from(nonce).toString("base64"),
			sha256,
			tags: tags.length > 0 ? tags : null,
		})
		.returning({ id: vaultItems.id });

	revalidatePath("/vault");

	// Background extraction: run AI on the uploaded file and persist results.
	// CVs additionally back-fill the candidate profile so the search profile
	// is populated immediately. Errors are swallowed so a flaky AI call never
	// breaks the upload UX — the file is already safely stored.
	if (inserted?.id) {
		after(() =>
			extractAndPersist(inserted.id, userId, plain, mime, kind).catch((e) => {
				console.error("[vault.extract] failed", { id: inserted.id, error: e });
			}),
		);
	}
}

async function extractAndPersist(
	itemId: string,
	userId: string,
	plain: Uint8Array,
	mime: string,
	hint: Kind,
): Promise<void> {
	const ai = getAIProvider();
	const extracted = await ai.extractDocument(plain, mime, hint);

	await db
		.update(vaultItems)
		.set({
			extractedKind: extracted.kind,
			extractedMeta: extracted,
			extractedAt: new Date(),
			// If detection corrected the kind (cv heuristic but it's actually a
			// certificate, etc.), promote it so the UI labels match.
			kind: extracted.kind,
		})
		.where(eq(vaultItems.id, itemId));

	if (extracted.kind === "cv") {
		await mergeCvIntoProfile(userId, extracted.data as Record<string, unknown>);
	}
	// Anything that changes the vault (cert added, badge added, CV merged)
	// also changes the insights snapshot — recompute.
	await recomputeInsights(userId);
	if (extracted.kind === "cv") {
		await recomputeMatchesForCandidate(userId);
		// Frischer CV → KI-Gehaltsband automatisch für Deutschland holen,
		// damit der User direkt eine Empfehlung sieht statt nur einen
		// leeren KI-Empfehlung-Button. Fehlerschluckend, blockiert nichts.
		await autoSeedSalaryRecommendation(userId).catch((e) => {
			console.error("[vault.extract] auto-salary failed", e);
		});
		// Karriere-Analyse asynchron im Hintergrund anstoßen. Läuft mit
		// nach() → User-Response wartet nicht. Beim nächsten /profile-
		// Aufruf ist die Auswertung fertig.
		after(() =>
			autoSeedCareerAnalysis(userId).catch((e) => {
				console.error("[vault.extract] auto-career failed", e);
			}),
		);
	}

	revalidatePath("/vault");
	revalidatePath("/profile");
}

// Erst-Auswertung der Karriere im Hintergrund nach CV-Parse. Überschreibt
// existierende Analyse NICHT — wenn der User schon eine hat (auch eine
// alte), bleibt sie bis zum manuellen "Neu auswerten" stehen.
async function autoSeedCareerAnalysis(userId: string): Promise<void> {
	const [profile] = await db
		.select()
		.from(candidateProfiles)
		.where(eq(candidateProfiles.userId, userId))
		.limit(1);
	if (!profile) return;
	if (profile.careerAnalysis) return; // bereits vorhanden — nicht überschreiben
	const hasSignal =
		(profile.skills?.length ?? 0) >= 3 ||
		(profile.yearsExperience ?? 0) >= 1 ||
		!!profile.headline;
	if (!hasSignal) return;

	const ai = getAIProvider();
	const analysis = await ai.analyzeCareerProspects({
		profile: {
			displayName: profile.displayName ?? undefined,
			headline: profile.headline ?? undefined,
			location: profile.location ?? undefined,
			yearsExperience: profile.yearsExperience ?? undefined,
			languages: profile.languages ?? undefined,
			skills: profile.skills ?? undefined,
			experience: profile.experience ?? undefined,
			education: profile.education ?? undefined,
			summary: profile.summary ?? undefined,
			industries: profile.industries ?? undefined,
			awards: profile.awards ?? undefined,
			certificationsMentioned: profile.certificationsMentioned ?? undefined,
			mobility: profile.mobility ?? undefined,
			preferredRoleLevel: profile.preferredRoleLevel ?? undefined,
		},
		yearsActive: profile.yearsExperience ?? undefined,
		insights: profile.insights,
	});

	await db
		.update(candidateProfiles)
		.set({ careerAnalysis: analysis, careerAnalysisAt: new Date() })
		.where(eq(candidateProfiles.userId, userId));
}

// Nach einem frisch geparsten CV automatisch eine Gehaltsempfehlung für
// Deutschland holen und in salaryByCountry persistieren. Wird NICHT
// überschrieben wenn der User bereits ein DE-Land mit Eigen-Recommendation
// hinterlegt hat.
async function autoSeedSalaryRecommendation(userId: string): Promise<void> {
	const [profile] = await db
		.select()
		.from(candidateProfiles)
		.where(eq(candidateProfiles.userId, userId))
		.limit(1);
	if (!profile) return;

	// Genug Signal? Sonst ist die KI-Empfehlung Müll.
	const hasSignal =
		(profile.skills?.length ?? 0) >= 3 ||
		(profile.yearsExperience ?? 0) >= 1 ||
		!!profile.headline;
	if (!hasSignal) return;

	const existing = profile.salaryByCountry ?? [];
	const existingDe = existing.find((c) => c.country === "DE");
	if (existingDe?.recommendation) return;

	const ai = getAIProvider();
	const rec = await ai.recommendCandidateSalary({
		profile: {
			headline: profile.headline ?? undefined,
			location: profile.location ?? undefined,
			yearsExperience: profile.yearsExperience ?? undefined,
			skills: profile.skills ?? undefined,
			experience: profile.experience ?? undefined,
			education: profile.education ?? undefined,
			summary: profile.summary ?? undefined,
			industries: profile.industries ?? undefined,
			preferredRoleLevel: profile.preferredRoleLevel ?? undefined,
		},
		country: "DE",
		currency: "EUR",
	});

	const generatedAt = new Date().toISOString();
	const nextDe: (typeof existing)[number] = {
		country: "DE",
		currency: "EUR",
		min: existingDe?.min,
		desired: existingDe?.desired,
		recommendation: {
			low: rec.low,
			mid: rec.mid,
			high: rec.high,
			rationale: rec.rationale,
			generatedAt,
		},
	};
	const next = existingDe
		? existing.map((c) => (c.country === "DE" ? nextDe : c))
		: [...existing, nextDe];

	await db
		.update(candidateProfiles)
		.set({ salaryByCountry: next })
		.where(eq(candidateProfiles.userId, userId));
}

// Conservative merge: only fill candidate profile fields that are currently
// empty / null. We never overwrite something the user typed by hand.
async function mergeCvIntoProfile(
	userId: string,
	cv: Record<string, unknown>,
): Promise<void> {
	const [existing] = await db
		.select()
		.from(candidateProfiles)
		.where(eq(candidateProfiles.userId, userId))
		.limit(1);

	const patch: Partial<typeof candidateProfiles.$inferInsert> = {};

	const pickStr = (key: string): string | undefined => {
		const v = cv[key];
		return typeof v === "string" && v.trim() ? v : undefined;
	};
	const pickInt = (key: string): number | undefined => {
		const v = cv[key];
		return typeof v === "number" && Number.isFinite(v)
			? Math.floor(v)
			: undefined;
	};

	if (!existing?.displayName) patch.displayName = pickStr("displayName");
	if (!existing?.headline) patch.headline = pickStr("headline");
	if (!existing?.location) patch.location = pickStr("location");
	if (existing?.yearsExperience == null)
		patch.yearsExperience = pickInt("yearsExperience");
	if (!existing?.summary) patch.summary = pickStr("summary");

	const langs = cv.languages;
	if (!existing?.languages?.length && Array.isArray(langs)) {
		const list = langs.filter((l): l is string => typeof l === "string");
		if (list.length > 0) patch.languages = list;
	}

	const skills = cv.skills;
	if (!existing?.skills?.length && Array.isArray(skills)) {
		const list = skills.filter(
			(s): s is ProfileSkill =>
				typeof s === "object" &&
				s !== null &&
				typeof (s as { name?: unknown }).name === "string",
		);
		if (list.length > 0) patch.skills = list;
	}

	const exp = cv.experience;
	if (!existing?.experience?.length && Array.isArray(exp)) {
		const list = exp.filter(
			(e): e is ProfileExperience =>
				typeof e === "object" &&
				e !== null &&
				typeof (e as { company?: unknown }).company === "string" &&
				typeof (e as { role?: unknown }).role === "string" &&
				typeof (e as { start?: unknown }).start === "string",
		);
		if (list.length > 0) patch.experience = list;
	}

	const edu = cv.education;
	if (!existing?.education?.length && Array.isArray(edu)) {
		const list = edu.filter(
			(e): e is ProfileEducation =>
				typeof e === "object" &&
				e !== null &&
				typeof (e as { institution?: unknown }).institution === "string" &&
				typeof (e as { degree?: unknown }).degree === "string",
		);
		if (list.length > 0) patch.education = list;
	}

	const industries = cv.industries;
	if (!existing?.industries?.length && Array.isArray(industries)) {
		const list = industries
			.filter((i): i is string => typeof i === "string" && i.trim().length > 0)
			.slice(0, 8);
		if (list.length > 0) patch.industries = list;
	}

	const awards = cv.awards;
	if (!existing?.awards?.length && Array.isArray(awards)) {
		const list = awards
			.filter((a): a is string => typeof a === "string" && a.trim().length > 0)
			.slice(0, 12);
		if (list.length > 0) patch.awards = list;
	}

	const certs = cv.certificationsMentioned;
	if (!existing?.certificationsMentioned?.length && Array.isArray(certs)) {
		const list = certs.filter(
			(c): c is { name: string; issuer?: string; year?: string } =>
				typeof c === "object" &&
				c !== null &&
				typeof (c as { name?: unknown }).name === "string",
		);
		if (list.length > 0) patch.certificationsMentioned = list;
	}

	if (!existing?.mobility) {
		const mob = pickStr("mobility");
		if (mob) patch.mobility = mob;
	}

	if (!existing?.preferredRoleLevel) {
		const lvl = cv.preferredRoleLevel;
		if (
			typeof lvl === "string" &&
			["junior", "mid", "senior", "lead", "principal", "exec"].includes(lvl)
		) {
			patch.preferredRoleLevel = lvl as
				| "junior"
				| "mid"
				| "senior"
				| "lead"
				| "principal"
				| "exec";
		}
	}

	if (Object.keys(patch).length === 0) return;

	const values = { userId, ...patch, updatedAt: new Date() };
	await db
		.insert(candidateProfiles)
		.values(values)
		.onConflictDoUpdate({
			target: candidateProfiles.userId,
			set: { ...patch, updatedAt: new Date() },
		});
}

export async function deleteVaultItem(id: string): Promise<void> {
	const session = await auth();
	if (!session?.user?.id) throw new Error("unauthenticated");
	const userId = session.user.id;

	const [item] = await db
		.select()
		.from(vaultItems)
		.where(and(eq(vaultItems.id, id), eq(vaultItems.userId, userId)))
		.limit(1);
	if (!item) throw new Error("not found");

	// Hard-delete: object first (if any), row second. The sha256 stays in audit
	// logs (P5+). URL-based items have no S3 object to remove.
	if (item.storageKey) {
		await deleteObject(item.storageKey);
	}
	await db.delete(vaultItems).where(eq(vaultItems.id, id));

	revalidatePath("/vault");
}

// Adds an Open Badge purely by URL — no file upload, no encryption. We fetch
// the badge's public JSON-LD (Credly etc.), pull out the displayable fields,
// and persist a vault_items row with sourceUrl + badgeMeta. The image lives
// at the issuer; we just keep the URL.
export async function addBadgeFromUrl(formData: FormData): Promise<void> {
	const session = await auth();
	if (!session?.user?.id) throw new Error("unauthenticated");
	const userId = session.user.id;

	const url = String(formData.get("url") ?? "").trim();
	if (!url) throw new Error("Bitte eine URL angeben.");

	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new Error("Keine gültige URL.");
	}
	if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
		throw new Error("Nur http(s)-URLs sind erlaubt.");
	}

	const res = await fetch(url, { headers: { Accept: "application/json" } });
	if (!res.ok) {
		throw new Error(`Badge nicht erreichbar (HTTP ${res.status}).`);
	}
	const json = (await res.json()) as Record<string, unknown>;

	const meta = parseBadgeJsonLd(json);
	const filename = meta.name ?? parsed.hostname + parsed.pathname;

	await db.insert(vaultItems).values({
		userId,
		kind: "badge",
		filename,
		sourceUrl: url,
		badgeMeta: meta,
		mime: "application/ld+json",
		sizeBytes: 0,
	});

	revalidatePath("/vault");
}

// Best-effort extractor for OBI 2.0 + Credly assertion shapes. Anything we
// can't find stays undefined; the UI handles missing fields gracefully.
function parseBadgeJsonLd(json: Record<string, unknown>): BadgeMeta {
	const get = (...path: string[]): unknown => {
		let cur: unknown = json;
		for (const key of path) {
			if (cur && typeof cur === "object" && key in (cur as object)) {
				cur = (cur as Record<string, unknown>)[key];
			} else {
				return undefined;
			}
		}
		return cur;
	};
	const str = (v: unknown): string | undefined =>
		typeof v === "string" ? v : undefined;

	return {
		name:
			str(get("name")) ??
			str(get("badge", "name")) ??
			str(get("badge_template", "name")),
		description:
			str(get("description")) ??
			str(get("badge", "description")) ??
			str(get("badge_template", "description")),
		imageUrl:
			str(get("image")) ??
			str(get("image", "id")) ??
			str(get("badge", "image")) ??
			str(get("image_url")),
		issuerName:
			str(get("issuer", "name")) ??
			str(get("badge", "issuer", "name")) ??
			str(get("issuer")),
		issuedAt: str(get("issuedOn")) ?? str(get("issued_at")),
		criteriaUrl:
			str(get("criteria")) ??
			str(get("criteria", "id")) ??
			str(get("badge", "criteria_url")),
	};
}

export async function listVaultItems(): Promise<VaultItem[]> {
	const session = await auth();
	if (!session?.user?.id) return [];
	return db
		.select()
		.from(vaultItems)
		.where(eq(vaultItems.userId, session.user.id))
		.orderBy(desc(vaultItems.createdAt));
}
