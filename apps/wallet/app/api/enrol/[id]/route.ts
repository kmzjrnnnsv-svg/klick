import { relayRoute } from "@wallet/lib/wallet/confirm-relay";

export const dynamic = "force-dynamic";

// Bestätigungsseite → Signer: Einrichtungslink lesen (GET) und den neuen
// Sicherheitsschlüssel registrieren (POST). Prüfen tut der Signer (MAC aus
// dem Geheimnis des Links, das die App nie sieht).
const route = relayRoute("einrichtung");
export const GET = route.GET;
export const POST = route.POST;
export const OPTIONS = route.OPTIONS;
