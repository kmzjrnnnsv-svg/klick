import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { roleAllows } from "@wallet/lib/auth/permissions";
import { compareAnchor } from "@wallet/lib/wallet/signer/anchor";
import {
	confirmUrl,
	SignerCallError,
	type SignerHello,
	signerCall,
	signerErrorCode,
} from "@wallet/lib/wallet/signer/client";
import {
	resetSignerCache,
	signerHello,
	signerStateFor,
} from "@wallet/lib/wallet/signer/status";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startSignerServer } from "@/signer/server";
import { Signer } from "@/signer/service";

// Klick → Signer: Journal-Anker (nie zurück, nie verzweigt), Stand des
// Signers für Seiten, Fehlercodes für die Oberfläche, Rechte im Katalog.

describe("Journal-Anker", () => {
	const a = { seq: 10, head: "a".repeat(64) };
	it("weiter ist gut, zurück oder anders bei gleicher seq ist Alarm", () => {
		expect(compareAnchor(null, a)).toBe("ok");
		expect(compareAnchor(a, a)).toBe("ok");
		expect(compareAnchor(a, { seq: 11, head: "b".repeat(64) })).toBe("ok");
		expect(compareAnchor(a, { seq: 9, head: "c".repeat(64) })).toBe(
			"regressed",
		);
		expect(compareAnchor(a, { seq: 10, head: "d".repeat(64) })).toBe("forked");
	});
});

describe("Stand des Signers", () => {
	const hello = (over: Partial<SignerHello> = {}): SignerHello => ({
		v: 1,
		initialized: true,
		orgId: "org-1",
		rpId: "freigabe.raza.work",
		origin: "https://freigabe.raza.work",
		dev: false,
		networks: ["bitcoin_signet"],
		frozen: null,
		policyHash: "x",
		bundleHash: null,
		seq: 1,
		head: "h",
		...over,
	});
	it("bereit nur in der eigenen Org, eingerichtet und nicht eingefroren", () => {
		process.env.WALLET_SIGNER_SOCKET = "/run/klick-signer/app.sock";
		expect(signerStateFor(null, "org-1")).toBe("unreachable");
		expect(signerStateFor(hello({ initialized: false }), "org-1")).toBe(
			"uninitialized",
		);
		expect(signerStateFor(hello(), "org-2")).toBe("other_org");
		expect(
			signerStateFor(
				hello({ frozen: { reason: "x", at: 1, by: "app" } }),
				"org-1",
			),
		).toBe("frozen");
		expect(signerStateFor(hello(), "org-1")).toBe("ready");
		delete process.env.WALLET_SIGNER_SOCKET;
		expect(signerStateFor(hello(), "org-1")).toBe("off");
	});

	it("Fehlercodes für die Oberfläche", () => {
		expect(signerErrorCode(new SignerCallError("unreachable"))).toBe(
			"signer_unreachable",
		);
		expect(signerErrorCode(new SignerCallError("signer", "frozen"))).toBe(
			"signer_frozen",
		);
		expect(signerErrorCode(new Error("x"))).toBe("signer");
	});

	it("Link zur Bestätigungsseite nur mit CONFIRM_ORIGIN", () => {
		delete process.env.WALLET_CONFIRM_ORIGIN;
		expect(confirmUrl("ab".repeat(16))).toBeNull();
		process.env.WALLET_CONFIRM_ORIGIN = "https://freigabe.raza.work";
		expect(confirmUrl("ab".repeat(16))).toBe(
			`https://freigabe.raza.work/#i=${"ab".repeat(16)}`,
		);
		delete process.env.WALLET_CONFIRM_ORIGIN;
	});
});

describe("über den echten Socket", () => {
	let dir: string;
	let signer: Signer;
	let server: Awaited<ReturnType<typeof startSignerServer>>;
	const ORG = randomUUID();

	beforeAll(async () => {
		dir = mkdtempSync(join(tmpdir(), "klick-signer-client-"));
		signer = Signer.open({ dir, kek: randomBytes(32), dev: true });
		server = await startSignerServer(signer, {
			app: { path: join(dir, "app.sock"), mode: 0o660 },
			admin: { path: join(dir, "admin.sock"), mode: 0o600 },
			log: () => {},
		});
		const prep = signer.seedPrepare({ networks: ["bitcoin_signet"] });
		const w = (prep.words.bitcoin_signet as string).split(" ");
		signer.initCommit({
			token: prep.token,
			checks: { bitcoin_signet: { 1: w[0], 2: w[1], 3: w[2] } },
			orgId: ORG,
			rpId: "localhost",
			origin: "http://localhost:3201",
		});
		process.env.WALLET_SIGNER_SOCKET = join(dir, "app.sock");
		resetSignerCache();
	});

	afterAll(async () => {
		delete process.env.WALLET_SIGNER_SOCKET;
		await server.close();
		signer.close();
	});

	it("hello mit Journal-Kopf; Stand gemerkt", async () => {
		const h = await signerHello();
		expect(h?.orgId).toBe(ORG);
		expect(signerStateFor(h, ORG)).toBe("ready");
		const r = await signerCall<SignerHello>("hello");
		expect(r.seq).toBe(h?.seq);
		expect(r.head).toMatch(/^[0-9a-f]{64}$/);
	});

	it("ohne Socket: unreachable", async () => {
		process.env.WALLET_SIGNER_SOCKET = join(dir, "fehlt.sock");
		await expect(signerCall("hello")).rejects.toMatchObject({
			code: "unreachable",
		});
		process.env.WALLET_SIGNER_SOCKET = join(dir, "app.sock");
	});
});

describe("Rechte", () => {
	it("Bedienung legt Auszahlungen an, verwalten nur Inhaber:innen", () => {
		expect(roleAllows("operator", "wallet:initiate")).toBe(true);
		expect(roleAllows("viewer", "wallet:initiate")).toBe(false);
		expect(roleAllows("operator", "wallet:manage")).toBe(false);
		expect(roleAllows("owner", "wallet:manage")).toBe(true);
	});
});
