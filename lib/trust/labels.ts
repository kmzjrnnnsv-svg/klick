import type { Provider } from "@/db/schema";

// Kleine Helfer für Trust-Center-Seiten (Server und Client).

type ServiceType = NonNullable<Provider["serviceType"]>;

const SERVICE_TYPES: ReadonlySet<string> = new Set<ServiceType>([
	"cloud_iaas",
	"cloud_paas",
	"cloud_saas",
	"hosting",
	"network",
	"software",
	"security",
	"payment",
	"data",
	"other",
]);

export function isServiceType(v: string | null): v is ServiceType {
	return v !== null && SERVICE_TYPES.has(v);
}

export function trustDocumentHref(slug: string, versionId: string): string {
	return `/api/vertrauen/dokument?slug=${encodeURIComponent(slug)}&v=${encodeURIComponent(versionId)}`;
}

export function trustPublicPath(slug: string): string {
	return `/vertrauen/${slug}`;
}
