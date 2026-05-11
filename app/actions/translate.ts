"use server";

import { auth } from "@/auth";
import { getAIProvider } from "@/lib/ai";

// Generischer Translate-Endpoint für UI-Translate-on-demand-Buttons.
// Hält Authentifizierung als minimalen Schutz vor Open-API-Abuse —
// nur eingeloggte User dürfen übersetzen lassen.
//
// Hard cap: 50 Strings pro Call, jeder max 4000 Zeichen. Verhindert
// dass jemand das Modell für Roman-Übersetzungen missbraucht.
export type TranslateInput = {
	texts: string[];
	from: "de" | "en";
	to: "de" | "en";
	context?: string;
};

export async function translateTexts(
	input: TranslateInput,
): Promise<{ ok: true; texts: string[] } | { ok: false; error: string }> {
	const session = await auth();
	if (!session?.user?.id) return { ok: false, error: "unauthenticated" };
	if (!Array.isArray(input.texts) || input.texts.length === 0) {
		return { ok: true, texts: [] };
	}
	if (input.texts.length > 50) {
		return { ok: false, error: "Zu viele Texte (max 50 pro Aufruf)." };
	}
	for (const t of input.texts) {
		if (typeof t !== "string") return { ok: false, error: "Ungültiger Text." };
		if (t.length > 4000)
			return { ok: false, error: "Text zu lang (max 4000 Zeichen)." };
	}
	if (input.from === input.to) return { ok: true, texts: input.texts };
	if (
		(input.from !== "de" && input.from !== "en") ||
		(input.to !== "de" && input.to !== "en")
	) {
		return { ok: false, error: "Nur DE↔EN unterstützt." };
	}
	try {
		const ai = getAIProvider();
		// 15-Sek-Timeout — wir wollen den Browser nicht ewig warten lassen.
		const out = await Promise.race<string[]>([
			ai.translateTexts(input),
			new Promise<string[]>((_, reject) =>
				setTimeout(() => reject(new Error("translation timeout 15s")), 15_000),
			),
		]);
		return { ok: true, texts: out };
	} catch (e) {
		console.error("[translate]", e);
		return {
			ok: false,
			error: e instanceof Error ? e.message : "Übersetzung fehlgeschlagen.",
		};
	}
}
