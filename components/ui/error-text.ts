// Fehlercode einer Action → Satz mit nächstem Schritt (Apple HIG: sagen,
// was passiert ist und was die Person tun kann; nie ein roher Code).
// `tc` ist der Übersetzer für „Common“ (beide Apps führen die Schlüssel).
// Sätze von Better Auth (mit Leerzeichen) kommen unverändert durch.

export type CommonErrorKey =
	| "error"
	| "errorRef"
	| "errorForbidden"
	| "errorNotFound"
	| "errorInvalid"
	| "errorRateLimited"
	| "errorSession"
	| "errorStepUp";

type Translate = (key: CommonErrorKey, values?: { ref: string }) => string;

type Failure =
	| { ok?: boolean; error?: unknown; ref?: unknown }
	| string
	| null
	| undefined;

const BY_CODE: Record<string, CommonErrorKey> = {
	forbidden: "errorForbidden",
	notFound: "errorNotFound",
	not_found: "errorNotFound",
	invalid: "errorInvalid",
	validation: "errorInvalid",
	rate_limited: "errorRateLimited",
	unauthenticated: "errorSession",
	session_expired: "errorSession",
	mfa_required: "errorSession",
	access_expired: "errorSession",
	step_up_required: "errorStepUp",
};

export function errorText(tc: Translate, res?: Failure): string {
	const code =
		typeof res === "string"
			? res
			: typeof res?.error === "string"
				? res.error
				: undefined;
	const ref = typeof res === "object" && typeof res?.ref === "string" ? res.ref : undefined;
	if (code && code.includes(" ")) return code;
	const key = code ? BY_CODE[code] : undefined;
	if (key) return tc(key);
	return ref ? tc("errorRef", { ref }) : tc("error");
}
