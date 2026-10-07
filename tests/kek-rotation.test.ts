import { describe, expect, it } from "vitest";
import { generateDek, unwrapDek, wrapDek } from "@/lib/crypto/envelope";
import { LocalKms } from "@/lib/crypto/kms";
import { rewrapDek, rotationPlan } from "@/lib/crypto/rotate";

const randomKek = () =>
	Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64");

describe("KEK-Rotation", () => {
	it("umhüllt den DEK neu, der DEK selbst bleibt gleich", async () => {
		const k1 = randomKek();
		const k2 = randomKek();
		const v1 = LocalKms.fromEnv({ VAULT_KEK_BASE64: k1 });
		const dek = await generateDek();
		const wrappedV1 = await wrapDek(dek, v1);
		expect(wrappedV1.keyVersion).toBe(1);

		// Rotation: neuer KEK als v2, alter als V1 weiterhin lesbar.
		const v2 = LocalKms.fromEnv({
			VAULT_KEK_BASE64: k2,
			VAULT_KEK_VERSION: "2",
			VAULT_KEK_BASE64_V1: k1,
		});
		const { changed, next } = await rewrapDek(wrappedV1, v2);
		expect(changed).toBe(true);
		expect(next.keyVersion).toBe(2);
		expect(next.wrapped).not.toBe(wrappedV1.wrapped);
		expect(await unwrapDek(next, v2)).toEqual(dek);

		// Nach Abschluss ohne alten KEK: neue Hülle lesbar, alte nicht.
		const onlyV2 = LocalKms.fromEnv({
			VAULT_KEK_BASE64: k2,
			VAULT_KEK_VERSION: "2",
		});
		expect(await unwrapDek(next, onlyV2)).toEqual(dek);
		await expect(unwrapDek(wrappedV1, onlyV2)).rejects.toThrow(/Version 1/);

		// Idempotent: bereits aktuelle Version bleibt unverändert.
		const again = await rewrapDek(next, v2);
		expect(again.changed).toBe(false);
		expect(again.next).toBe(next);
	});

	it("Plan: zählt Versionen und trennt zu rotierende Orgs", () => {
		const plan = rotationPlan(
			[
				{ orgId: "a", keyVersion: 1 },
				{ orgId: "b", keyVersion: 2 },
				{ orgId: "c", keyVersion: 1 },
			],
			2,
		);
		expect(plan.toRotate).toEqual(["a", "c"]);
		expect(plan.upToDate).toEqual(["b"]);
		expect(plan.byVersion).toEqual({ 1: 2, 2: 1 });
	});
});
