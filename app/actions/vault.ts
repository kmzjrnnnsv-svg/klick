"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import { users, type VaultItem, vaultItems } from "@/db/schema";
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

	// Hard-delete: object first, row second. The sha256 stays in audit logs (P5+).
	await deleteObject(item.storageKey);
	await db.delete(vaultItems).where(eq(vaultItems.id, id));

	revalidatePath("/vault");
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
