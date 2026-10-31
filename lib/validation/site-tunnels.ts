import { z } from "zod";
import { MAX_SITE_NETS, SITE_TECHS } from "@/lib/site-tunnels/rules";
import { SITE_VENDORS, VENDOR_GUIDES } from "@/lib/site-tunnels/vendors";

// Standort-Tunnel (ADR-033): Eingaben im Assistenten. Die fachliche Prüfung
// (öffentliche IP, private Netze, Überschneidung) macht lib/site-tunnels/rules.ts
// bzw. lib/db/site-tunnels.ts; hier nur Form und Längen.

export const siteTunnelPlanSchema = z.object({
	orgId: z.uuid(),
	tech: z.enum(SITE_TECHS),
	peerIp: z.string().trim().min(7).max(15),
	customerNets: z
		.array(z.string().trim().min(9).max(18))
		.min(1)
		.max(MAX_SITE_NETS),
});

export const siteTunnelCreateSchema = siteTunnelPlanSchema
	.extend({
		name: z.string().trim().min(2).max(80),
		vendor: z.enum(SITE_VENDORS),
	})
	.refine((v) => VENDOR_GUIDES[v.vendor].supports.includes(v.tech), {
		message: "tech_not_supported",
		path: ["tech"],
	});

export const siteTunnelRefSchema = z.object({
	orgId: z.uuid(),
	id: z.uuid(),
});
