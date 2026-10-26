import { relayRoute } from "@wallet/lib/wallet/confirm-relay";

export const dynamic = "force-dynamic";

// Bestätigungsseite → Signer: Vollmacht lesen (GET) und mit dem
// Sicherheitsschlüssel freigeben (POST). Prüfen tut der Signer.
const route = relayRoute("vollmacht");
export const GET = route.GET;
export const POST = route.POST;
export const OPTIONS = route.OPTIONS;
