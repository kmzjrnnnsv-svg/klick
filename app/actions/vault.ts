"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import { type BadgeMeta, users, type VaultItem, vaultItems } from "@/db/schema";
import {
	encryptBytes,
	generateDek,
	sha256Hex,
	unwrapDek,
	wrapDek,
} from "@/lib/crypto/envelope";
import { deleteObject, putBytes } from "@/lib/storage/s3";

const VALID_KINDS = ["cv", "certificate", "badge", "id_doc", "other"] as const;
type Kind = (typeof VALID_KINDS)[number];

function pickKind(raw: FormDataEntryValue | null): Kind {
	const v = String(raw ?? "other");
	return (VALID_KINDS as readonly string[]).includes(v) ? (v as Kind) : "other";
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

	const kind = pickKind(formData.get("kind"));
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

	await db.insert(vaultItems).values({
		userId,
		kind,
		filename: file.name,
		mime: file.type || "application/octet-stream",
		sizeBytes: plain.length,
		storageKey,
		nonce: Buffer.from(nonce).toString("base64"),
		sha256,
		tags: tags.length > 0 ? tags : null,
	});

	revalidatePath("/vault");
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
