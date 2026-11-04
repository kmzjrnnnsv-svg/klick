// Identität anbinden (Teil D): gemeinsame Formen für Anbieter (Entra ID,
// Google Workspace, Okta), die reinen Prüfungen und den Dienst. Rein, ohne
// Server-Importe. Gespeichert wird nur, was hier steht: nie Rohantworten,
// Telefonnummern, Anmeldeprotokolle, IP-Adressen oder Gruppen.

export const IDENTITY_PROVIDERS = ["entra", "google", "okta"] as const;
export type IdentityProvider = (typeof IDENTITY_PROVIDERS)[number];

// Ein Konto, wie der Anbieter es meldet, schon vereinheitlicht
export type ProviderAccount = {
	externalId: string;
	// Anmeldename bzw. Mail, klein geschrieben; null, wenn der Anbieter keine
	// Adresse kennt (z. B. Dienstkonto ohne Postfach)
	email: string | null;
	displayName: string;
	kind: "member" | "guest";
	enabled: boolean;
	// hat mindestens eine Administratorrolle
	isAdmin: boolean;
	// höchste Rolle (Entra „Global Administrator“, Google Super-Admin, Okta
	// Super Administrator)
	isTopAdmin: boolean;
	// Namen der Administratorrollen, höchstens 10
	adminRoles: string[];
	// MFA registriert; null = unbekannt (Lizenz oder Recht fehlt)
	mfaRegistered: boolean | null;
	// ISO-Zeitpunkte bzw. -Tag; null = unbekannt oder nie
	lastSignInAt: string | null;
	createdAt: string | null;
	leaveAt: string | null;
};

// Was der Anbieter mit den erteilten Rechten und der Lizenz liefern konnte
export type ProviderCapabilities = {
	signIn: boolean;
	mfa: boolean;
	roles: boolean;
	leaveDate: boolean;
};

export type ProviderSnapshot = {
	accounts: ProviderAccount[];
	capabilities: ProviderCapabilities;
	// bestätigte Domains des Tenants (klein geschrieben)
	domains: string[];
};

export type ProviderError =
	| "host_not_allowed"
	| "blocked_address"
	| "dns"
	| "timeout"
	| "network"
	| "too_large"
	| "token_failed"
	| "consent_missing"
	| "forbidden"
	| "throttled"
	| "too_many"
	| "bad_response";

export type ProviderResult<T> =
	| { ok: true; value: T }
	| { ok: false; error: ProviderError };

// Prüfungen je Control (Teil D, Tabelle im Plan)
export const IDENTITY_CHECKS = {
	mfa: "CC-IAM-03",
	privileged: "CC-IAM-04",
	leavers: "CC-IAM-02",
	recert: "CC-IAM-05",
} as const;
export type IdentityCheckKey = keyof typeof IDENTITY_CHECKS;

export type CheckOutcome = "pass" | "partial" | "fail" | "not_assessable";

// Begründung als Code mit Zahlen (Text kommt aus messages/de.json)
export type CheckReason = {
	code: string;
	count?: number;
	value?: number;
	limit?: number;
};

export type CheckResult = {
	key: IdentityCheckKey;
	controlCode: (typeof IDENTITY_CHECKS)[IdentityCheckKey];
	result: CheckOutcome;
	reasons: CheckReason[];
	// betroffene Konten (Kennungen aus identity_accounts), höchstens 50
	affected: string[];
};

export const EXCEPTION_KINDS = ["emergency", "service", "other"] as const;
export type ExceptionKind = (typeof EXCEPTION_KINDS)[number];
