import { redirect } from "next/navigation";
import { describe, expect, it } from "vitest";
import { safeAction } from "@/lib/actions/safe";
import { AuthError } from "@/lib/auth/session-rules";

// Sicherheitsnetz für Server-Actions: nie werfen, immer ActionResult —
// außer Next-interne Steuerfehler (redirect/notFound), die weiterlaufen.

describe("safeAction", () => {
	it("reicht Erfolge unverändert durch", async () => {
		const fn = safeAction("ok", async (n: number) => ({ ok: true, data: n }));
		await expect(fn(7)).resolves.toEqual({ ok: true, data: 7 });
	});

	it("macht aus einer Ausnahme ein Ergebnis mit Referenz", async () => {
		const fn = safeAction("boom", async () => {
			throw new Error("db down");
		});
		const res = (await fn()) as { ok: boolean; error: string; ref?: string };
		expect(res.ok).toBe(false);
		expect(res.error).toBe("error");
		expect(res.ref).toMatch(/^[0-9a-f]{8}$/);
	});

	it("bildet AuthError auf den Code ab (ohne Referenz)", async () => {
		const fn = safeAction("auth", async () => {
			throw new AuthError("step_up_required");
		});
		await expect(fn()).resolves.toEqual({
			ok: false,
			error: "step_up_required",
		});
	});

	it("lässt redirect() durch", async () => {
		const fn = safeAction("redir", async () => {
			redirect("/heute");
		});
		await expect(fn()).rejects.toMatchObject({
			digest: expect.stringContaining("NEXT_REDIRECT"),
		});
	});

	it("nutzt den Fallback für Actions ohne ActionResult", async () => {
		const fn = safeAction(
			"bool",
			async (): Promise<boolean> => {
				throw new Error("x");
			},
			() => false,
		);
		await expect(fn()).resolves.toBe(false);
	});
});
