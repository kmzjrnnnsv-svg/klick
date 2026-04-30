"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
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
		// Match-Engine neu rechnen, weil sich Skills/Erfahrung geändert haben.
		await recomputeMatchesForCandidate(userId);
	}

	revalidatePath("/vault");
	revalidatePath("/profile");
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
