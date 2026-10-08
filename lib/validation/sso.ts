import { z } from "zod";

// SSO je Organisation (OIDC). Lebt außerhalb der "use server"-Datei, weil
// Server-Action-Module nur async Funktionen exportieren dürfen.

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
	issuer: z.url(),
	clientId: z.string().trim().min(1).max(200),
	clientSecret: z.string().min(1).max(500),
	discoveryEndpoint: z
		.url()
		.optional()
		.or(z.literal("").transform(() => undefined)),
	scopes: z.string().trim().max(200).optional(),
});

export type RegisterSsoInput = z.infer<typeof registerSsoSchema>;
