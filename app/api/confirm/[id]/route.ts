import { relayRoute } from "@/lib/wallet/confirm-relay";

export const dynamic = "force-dynamic";

// Legacy (bis K6): dieselbe Weiterleitung wie /api/wallet/bestaetigung —
// die Bestätigungsseite (deploy/confirm) ruft seit both.money diesen Pfad.
const route = relayRoute("bestaetigung");
export const GET = route.GET;
export const POST = route.POST;
export const OPTIONS = route.OPTIONS;
