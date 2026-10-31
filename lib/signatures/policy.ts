// Unterschriften nur mit Sicherheitsschlüssel (AP9.1b), rein. Ist die Regel
// an, zählen für Unterschriften (Nachweise, Dokument-Umlauf) nur
// gerätegebundene Schlüssel: bei der Registrierung „singleDevice“ und nicht
// gesichert, in der Assertion BE = 0. Synchronisierte Passkeys bleiben für
// die Anmeldung gültig. Das ist eine Angabe des Authenticators, keine
// Attestierung (wie both.money, ADR-031).

export type SignaturePolicy = { securityKeysOnly: boolean };

export function signaturePolicyOf(raw: unknown): SignaturePolicy {
	const r = (raw ?? {}) as { securityKeysOnly?: unknown };
	return { securityKeysOnly: r.securityKeysOnly === true };
}

// Lockern = Regel ausschalten (Vier-Augen); einschalten wirkt sofort
export function signaturePolicyRelaxed(
	before: SignaturePolicy,
	after: SignaturePolicy,
): boolean {
	return before.securityKeysOnly && !after.securityKeysOnly;
}

export function deviceBoundPasskey(pk: {
	deviceType: string;
	backedUp: boolean;
}): boolean {
	return pk.deviceType === "singleDevice" && !pk.backedUp;
}

// Flags der Assertion: BE (0x08) oder BS (0x10) gesetzt = synchronisierbar
export function assertionDeviceBound(flags: {
	backupEligible: boolean;
	backupState: boolean;
}): boolean {
	return !flags.backupEligible && !flags.backupState;
}
