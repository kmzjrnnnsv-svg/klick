"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

export async function setLocaleAction(locale: "de" | "en") {
	(await cookies()).set("NEXT_LOCALE", locale, {
		path: "/",
		maxAge: 60 * 60 * 24 * 365,
		sameSite: "lax",
	});
	revalidatePath("/", "layout");
}
