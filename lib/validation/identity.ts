import { z } from "zod";

// Identität anbinden (Teil D): Eingaben der Einstellungen

// Tenant als ID (GUID) oder Domain (z. B. contoso.onmicrosoft.com)
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOMAIN = /^(?=.{4,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/i;

export const entraTenantSchema = z.object({
	tenant: z
		.string()
		.trim()
		.toLowerCase()
		.refine((v) => GUID.test(v) || DOMAIN.test(v), "tenant_invalid"),
});

export const identitySourceIdSchema = z.object({
	sourceId: z.uuid(),
});
