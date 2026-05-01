import { and, eq, isNull } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import {
	disclosures,
	employers,
	interests,
	users,
	vaultItems,
} from "@/db/schema";
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

	// Fetch the item (without ownership check) — we'll authorize below.
	const [item] = await db
		.select()
		.from(vaultItems)
		.where(eq(vaultItems.id, id))
		.limit(1);
	if (!item) return new Response("not found", { status: 404 });

	let authorized = item.userId === userId;
	if (!authorized) {
		// Employer access: requires an active disclosure on an interest the
		// requester owns the employer-side of.
		const [granted] = await db
			.select({ id: disclosures.id })
			.from(disclosures)
			.innerJoin(interests, eq(interests.id, disclosures.interestId))
			.innerJoin(employers, eq(employers.id, interests.employerId))
			.where(
				and(
					eq(disclosures.vaultItemId, id),
					isNull(disclosures.revokedAt),
					eq(employers.userId, userId),
				),
			)
			.limit(1);
		authorized = !!granted;
	}
	if (!authorized) {
		return new Response("forbidden", { status: 403 });
	}

	// URL-based items (e.g. Credly badges) have no encrypted file — point the
	// caller at the source URL instead of trying to decrypt nothing.
	if (item.sourceUrl && !item.storageKey) {
		return Response.redirect(item.sourceUrl, 302);
	}

	if (!item.storageKey || !item.nonce || !item.mime) {
		return new Response("vault item has no payload", { status: 500 });
	}

	// Owner of the item — that's whose DEK we need to unwrap, regardless of
	// who is fetching.
	const [owner] = await db
		.select({ encryptedDek: users.encryptedDek })
		.from(users)
		.where(eq(users.id, item.userId))
		.limit(1);
	if (!owner?.encryptedDek) {
		return new Response("vault key missing", { status: 500 });
	}

	const dek = await unwrapDek(owner.encryptedDek);
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
