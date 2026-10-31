import { clientIp, ingestJson, ingestRoute } from "@/lib/security/ingest";
import {
	fillStep,
	TRANSFER_STEP,
	VENDOR_GUIDES,
} from "@/lib/site-tunnels/vendors";
import { cookieToken, perIp, siteFrom } from "./_shared";

export const dynamic = "force-dynamic";

// Link für die IT (Standort-Tunnel, ADR-033): Werte, Schritte für die
// Firewall der Kundin und der Stand des Tunnels. Nichts Geheimes; den
// Schlüssel gibt es nur über POST /api/standort/geheimnis (mit Eintrag in der
// Kette der Org).
export const GET = ingestRoute("site_setup.view", async (req: Request) => {
	if (!perIp.check(clientIp(req)).allowed)
		return ingestJson(429, { error: "rate_limited" });
	const r = await siteFrom(req, cookieToken(req));
	if (!r.ok) return ingestJson(r.status, { error: r.error });
	const v = r.site.view;
	const guide = VENDOR_GUIDES[v.tunnel.vendor];
	const fill = (s: string) =>
		fillStep(s, {
			server: v.values.server,
			service: v.values.service,
			nets: v.values.nets.join(", "),
			transfer: v.values.transferNet,
			port: v.values.port,
			host: v.values.host,
		});
	return ingestJson(200, {
		orgName: v.orgName,
		expiresAt: v.expiresAt,
		tunnel: {
			name: v.tunnel.name,
			tech: v.tunnel.tech,
			state: v.tunnel.state,
			lastHandshakeAt: v.tunnel.lastHandshakeAt,
		},
		vendorLabel: guide.label,
		note: guide.note ?? null,
		values: v.values,
		steps: [
			...(v.values.transferNet ? [fill(TRANSFER_STEP)] : []),
			...(guide.steps[v.tunnel.tech] ?? []).map(fill),
		],
	});
});
