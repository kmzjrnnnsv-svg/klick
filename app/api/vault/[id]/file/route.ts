import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { users, vaultItems } from "@/db/schema";
import { decryptBytes, unwrapDek } from "@/lib/crypto/envelope";
import { getBytes } from "@/lib/storage/s3";

export async function GET(
	_req: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;

	const session = await auth();
	if (!session?.user?.id) {
		return new Response("unauthorized", { status: 401 });
	}
	const userId = session.user.id;

	const [item] = await db
		.select()
		.from(vaultItems)
		.where(and(eq(vaultItems.id, id), eq(vaultItems.userId, userId)))
		.limit(1);
	if (!item) return new Response("not found", { status: 404 });

	// URL-based items (e.g. Credly badges) have no encrypted file — point the
	// caller at the source URL instead of trying to decrypt nothing.
	if (item.sourceUrl && !item.storageKey) {
		return Response.redirect(item.sourceUrl, 302);
	}

	if (!item.storageKey || !item.nonce || !item.mime) {
		return new Response("vault item has no payload", { status: 500 });
	}

	const [user] = await db
		.select({ encryptedDek: users.encryptedDek })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	if (!user?.encryptedDek) {
		return new Response("vault key missing", { status: 500 });
	}

	const dek = await unwrapDek(user.encryptedDek);
	const ciphertext = await getBytes(item.storageKey);
	const nonce = Uint8Array.from(Buffer.from(item.nonce, "base64"));
	const plain = await decryptBytes(ciphertext, nonce, dek);

	return new Response(new Uint8Array(plain), {
		headers: {
			"content-type": item.mime,
			"content-disposition": `inline; filename="${encodeURIComponent(item.filename)}"`,
			"cache-control": "private, no-store",
		},
	});
}
