"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";

export async function setLocaleAction(locale: "de" | "en") {
	(await cookies()).set("NEXT_LOCALE", locale, {
		path: "/",
		maxAge: 60 * 60 * 24 * 365,
		sameSite: "lax",
	});

	// Wenn eingeloggt: User-Locale zusätzlich in der DB persistieren — wird
	// von recomputeInsights gelesen, damit die KI-Narrative in der richtigen
	// Origin-Sprache generiert wird.
	try {
		const session = await auth();
		if (session?.user?.id) {
			await db
				.update(users)
				.set({ locale })
				.where(eq(users.id, session.user.id));
		}
	} catch {
		// Cookie reicht — DB-Update ist Bonus.
	}

	revalidatePath("/", "layout");
}
