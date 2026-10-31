import { describe, expect, it } from "vitest";
import {
	assertionDeviceBound,
	deviceBoundPasskey,
	signaturePolicyOf,
	signaturePolicyRelaxed,
} from "@/lib/signatures/policy";

// Unterschriften nur mit Sicherheitsschlüssel (AP9.1b)

describe("Regel für Unterschriften", () => {
	it("liest nur ein echtes true als an", () => {
		expect(signaturePolicyOf({})).toEqual({ securityKeysOnly: false });
		expect(signaturePolicyOf(null)).toEqual({ securityKeysOnly: false });
		expect(signaturePolicyOf({ securityKeysOnly: "true" })).toEqual({
			securityKeysOnly: false,
		});
		expect(signaturePolicyOf({ securityKeysOnly: true })).toEqual({
			securityKeysOnly: true,
		});
	});

	it("nur Ausschalten ist Lockern (Vier-Augen)", () => {
		const on = { securityKeysOnly: true };
		const off = { securityKeysOnly: false };
		expect(signaturePolicyRelaxed(on, off)).toBe(true);
		expect(signaturePolicyRelaxed(off, on)).toBe(false);
		expect(signaturePolicyRelaxed(on, on)).toBe(false);
	});

	it("gerätegebunden: Registrierung und Assertion", () => {
		expect(
			deviceBoundPasskey({ deviceType: "singleDevice", backedUp: false }),
		).toBe(true);
		expect(
			deviceBoundPasskey({ deviceType: "multiDevice", backedUp: true }),
		).toBe(false);
		expect(
			deviceBoundPasskey({ deviceType: "singleDevice", backedUp: true }),
		).toBe(false);
		expect(
			assertionDeviceBound({ backupEligible: false, backupState: false }),
		).toBe(true);
		expect(
			assertionDeviceBound({ backupEligible: true, backupState: false }),
		).toBe(false);
		expect(
			assertionDeviceBound({ backupEligible: false, backupState: true }),
		).toBe(false);
	});
});
