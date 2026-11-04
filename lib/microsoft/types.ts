import type { ProviderResult } from "@/lib/identity/types";

// Lesender Zugriff auf Microsoft Graph für einen Tenant (Teil D). Der Client
// (lib/microsoft/graph-client.ts) holt das Token, lässt nur
// https://graph.microsoft.com zu (auch für @odata.nextLink), wartet bei 429
// einmal höchstens 60 s und meldet sonst „throttled“. Andere Statuscodes
// (auch 403) kommen als Antwort zurück; die Anbieter-Module entscheiden.

export type MsResponse = { status: number; body: string };

// pathOrUrl: „/users?…“ (relativ zu /v1.0) oder eine volle nextLink-Adresse
export type MsGet = (
	tenantId: string,
	pathOrUrl: string,
) => Promise<ProviderResult<MsResponse>>;
