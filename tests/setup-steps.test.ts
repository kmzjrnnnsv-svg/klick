import { describe, expect, it } from "vitest";
import {
	markStepDone,
	neighbours,
	SETUP_FLAG,
	setupState,
	shouldRedirectToSetup,
} from "@/lib/setup/steps";

const now = new Date("2026-10-18T10:00:00Z");

describe("setupState", () => {
	it("neue Org: gestartet, nichts erledigt, leitet um", () => {
		const f = { [SETUP_FLAG.started]: now.toISOString() };
		const s = setupState(f);
		expect(s.next).toBe("rollen");
		expect(shouldRedirectToSetup(s)).toBe(true);
	});
	it("Bestands-Org ohne Start leitet nie um", () => {
		expect(shouldRedirectToSetup(setupState({}))).toBe(false);
	});
	it("Schritte markieren, Reihenfolge stabil, Rahmenwerke beenden die Pflicht", () => {
		let f: Record<string, string> = {};
		f = markStepDone(f, "standorte", now);
		f = markStepDone(f, "rollen", now);
		f = markStepDone(f, "rollen", now);
		expect(f[SETUP_FLAG.done]).toBe("rollen,standorte");
		expect(setupState(f).next).toBe("unternehmen");
		f = markStepDone(f, "rahmenwerke", now);
		expect(shouldRedirectToSetup(setupState(f))).toBe(false);
		f = markStepDone(f, "gap-analyse", now);
		expect(setupState(f).completed).toBe(true);
		expect(setupState(f).next).toBeNull();
	});
	it("Später fortsetzen stoppt die Umleitung", () => {
		const s = setupState({
			[SETUP_FLAG.started]: "x",
			[SETUP_FLAG.deferred]: "y",
		});
		expect(shouldRedirectToSetup(s)).toBe(false);
	});
	it("Nachbarn", () => {
		expect(neighbours("rollen")).toEqual({ prev: null, next: "unternehmen" });
		expect(neighbours("gap-analyse").next).toBeNull();
	});
});
