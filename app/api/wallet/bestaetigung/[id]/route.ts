import { relayRoute } from "@/lib/wallet/confirm-relay";

export const dynamic = "force-dynamic";

// Bestätigungsseite → Signer: Absicht lesen (GET) und mit dem
// Sicherheitsschlüssel bestätigen (POST). Prüfen tut der Signer.
const route = relayRoute("bestaetigung");
export const GET = route.GET;
export const POST = route.POST;
export const OPTIONS = route.OPTIONS;
