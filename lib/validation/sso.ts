import { z } from "zod";

// SSO je Organisation (OIDC). Lebt außerhalb der "use server"-Datei, weil
// Server-Action-Module nur async Funktionen exportieren dürfen.

// Issuer/Discovery ruft der Server ab → nur https auf öffentliche Hosts
// (kein SSRF auf localhost, Metadaten-Dienste oder interne Netze).
export function isPublicHttpsUrl(value: string): boolean {
	let u: URL;
	try {
		u = new URL(value);
	} catch {
		return false;
	}
	if (u.protocol !== "https:") return false;
	const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
	if (
		host === "localhost" ||
		host.endsWith(".localhost") ||
		host.endsWith(".local") ||
		host.endsWith(".internal") ||
		(!host.includes(".") && !host.includes(":"))
	)
		return false;
	const v4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
	if (v4) {
		const [a, b] = [Number(v4[1]), Number(v4[2])];
		if (
			a === 0 ||
			a === 10 ||
			a === 127 ||
			(a === 100 && b >= 64 && b <= 127) ||
			(a === 169 && b === 254) ||
			(a === 172 && b >= 16 && b <= 31) ||
			(a === 192 && b === 168) ||
			a >= 224
		)
			return false;
	}
	if (host.includes(":")) {
		// IPv6-Literal: Loopback, link-local, ULA, v4-mapped sperren.
		if (
			host === "::1" ||
			host === "::" ||
			/^fe[89ab]/.test(host) ||
			/^f[cd]/.test(host) ||
			host.startsWith("::ffff:")
		)
			return false;
	}
	return true;
}

const publicHttpsUrl = z
	.url()
	.refine(isPublicHttpsUrl, { message: "Nur https auf öffentliche Hosts" });

export const ssoProviderIdSchema = z
	.string()
	.trim()
	.regex(/^[a-z0-9][a-z0-9-]{2,39}$/, "Kleinbuchstaben, Ziffern, Bindestrich");

export const registerSsoSchema = z.object({
	providerId: ssoProviderIdSchema,
	domain: z
		.string()
		.trim()
		.toLowerCase()
		.regex(/^(?=.{4,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/, "z. B. firma.de"),
	issuer: publicHttpsUrl,
	clientId: z.string().trim().min(1).max(200),
	clientSecret: z.string().min(1).max(500),
	discoveryEndpoint: publicHttpsUrl
		.optional()
		.or(z.literal("").transform(() => undefined)),
	scopes: z.string().trim().max(200).optional(),
});

export type RegisterSsoInput = z.infer<typeof registerSsoSchema>;
