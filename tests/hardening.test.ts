import { describe, expect, it } from "vitest";
import { parseOrgDatabaseUrls } from "@/lib/db/router";
import {
	authHeader,
	buildEvent,
	parseDsn,
	scrubText,
	scrubValue,
	storeUrl,
} from "@/lib/observability/glitchtip";
import { SlidingWindowLimiter } from "@/lib/rate-limit";
import { instreamFrames, parseClamdReply } from "@/lib/uploads/clamav";

describe("ClamAV INSTREAM", () => {
	it("rahmt Daten in 64-KiB-Blöcke mit Längenpräfix und Null-Terminator", () => {
		const bytes = new Uint8Array(70_000).fill(1);
		const frames = instreamFrames(bytes);
		expect(new TextDecoder().decode(frames[0])).toBe("zINSTREAM\0");
		const len1 = new DataView((frames[1] as Uint8Array).buffer).getUint32(
			0,
			false,
		);
		expect(len1).toBe(65_536);
		expect(frames[2]?.byteLength).toBe(65_536);
		const len2 = new DataView((frames[3] as Uint8Array).buffer).getUint32(
			0,
			false,
		);
		expect(len2).toBe(70_000 - 65_536);
		expect(frames.at(-1)).toEqual(new Uint8Array([0, 0, 0, 0]));
	});

	it("parst OK, FOUND und ERROR", () => {
		expect(parseClamdReply("stream: OK\0")).toEqual({ status: "clean" });
		expect(parseClamdReply("stream: Eicar-Test-Signature FOUND\0")).toEqual({
			status: "infected",
			signature: "Eicar-Test-Signature",
		});
		expect(parseClamdReply("INSTREAM size limit exceeded. ERROR\0")).toEqual({
			status: "error",
			detail: "INSTREAM size limit exceeded. ERROR",
		});
		expect(parseClamdReply("")).toEqual({
			status: "error",
			detail: "leere Antwort",
		});
	});
});

describe("Org-Rate-Limit", () => {
	it("gleitendes Fenster: Limit, Retry-After, Erholung, 0 = aus", () => {
		const l = new SlidingWindowLimiter(3, 1_000);
		const t0 = 1_000_000;
		expect(l.check("a", t0).allowed).toBe(true);
		expect(l.check("a", t0 + 100).allowed).toBe(true);
		expect(l.check("a", t0 + 200)).toEqual({
			allowed: true,
			remaining: 0,
			retryAfterMs: 0,
		});
		const blocked = l.check("a", t0 + 300);
		expect(blocked.allowed).toBe(false);
		expect(blocked.retryAfterMs).toBe(700);
		// andere Org unabhängig
		expect(l.check("b", t0 + 300).allowed).toBe(true);
		// nach Ablauf des ältesten Treffers wieder frei
		expect(l.check("a", t0 + 1_001).allowed).toBe(true);
		expect(new SlidingWindowLimiter(0).check("x").allowed).toBe(true);
		l.sweep(t0 + 5_000);
		expect(l.size()).toBe(0);
	});
});

describe("DB-Router", () => {
	it("parst ORG_DATABASE_URLS und lehnt Unsinn ab", () => {
		expect(parseOrgDatabaseUrls(undefined)).toEqual({});
		expect(parseOrgDatabaseUrls(" ")).toEqual({});
		const id = "11111111-2222-3333-4444-555555555555";
		expect(
			parseOrgDatabaseUrls(`{"${id.toUpperCase()}":"postgres://u:p@h/db"}`),
		).toEqual({
			[id]: "postgres://u:p@h/db",
		});
		expect(() => parseOrgDatabaseUrls("nope")).toThrow(/JSON/);
		expect(() => parseOrgDatabaseUrls('["a"]')).toThrow(/Objekt/);
		expect(() => parseOrgDatabaseUrls('{"abc":"postgres://x"}')).toThrow(
			/UUID/,
		);
		expect(() => parseOrgDatabaseUrls(`{"${id}":"mysql://x"}`)).toThrow(
			/postgres/,
		);
	});
});

describe("GlitchTip", () => {
	it("DSN, Store-URL, Auth-Header", () => {
		const dsn = parseDsn("https://abc123@glitchtip.example.org/7");
		expect(dsn).toEqual({
			protocol: "https",
			host: "glitchtip.example.org",
			publicKey: "abc123",
			projectId: "7",
		});
		if (!dsn) throw new Error("dsn");
		expect(storeUrl(dsn)).toBe("https://glitchtip.example.org/api/7/store/");
		expect(authHeader(dsn, new Date(1_700_000_000_000))).toContain(
			"sentry_timestamp=1700000000, sentry_key=abc123",
		);
		expect(parseDsn("https://glitchtip.example.org/7")).toBeNull();
		expect(parseDsn("nicht-eine-url")).toBeNull();
	});

	it("scrubbt PII aus Text und Objekten, Event ohne Body/Cookie", () => {
		expect(
			scrubText(
				"Mail an max.mustermann@firma.de über /login?token=abcdef0123456789abcdef0123456789abcd",
			),
		).toBe("Mail an [email] über /login?[query]");
		expect(
			scrubValue({ cookie: "x", nested: { email: "a@b.de", ok: 1 } }),
		).toEqual({
			cookie: "[redacted]",
			nested: { email: "[redacted]", ok: 1 },
		});
		const err = Object.assign(new Error("Fehler für kim@firma.de"), {
			digest: "123",
		});
		const ev = buildEvent(err, {
			path: "/api/nachweise/1?sig=abcdefghijklmnopqrstuvwxyz0123456789",
			method: "GET",
			routeType: "render",
			orgId: "org-1",
			environment: "production",
		});
		expect(ev.exception.values[0]?.value).toBe("Fehler für [email]");
		expect(ev.request?.url).toBe("/api/nachweise/1?[query]");
		expect(ev.tags).toEqual({
			routeType: "render",
			orgId: "org-1",
			digest: "123",
		});
		expect(ev.environment).toBe("production");
		expect(ev.event_id).toHaveLength(32);
		expect(JSON.stringify(ev)).not.toContain("body");
	});
});
