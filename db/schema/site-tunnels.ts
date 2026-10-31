import { sql } from "drizzle-orm";
import {
	boolean,
	index,
	jsonb,
	pgTable,
	text,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { orgPolicy } from "../rls";
import { orgId, pk, ts, userRef } from "./_shared";

// Standort-Tunnel (Admin-Portal, Teil 7, ADR-033): Büro der Kundin ↔
// Klick-Server über IPsec IKEv2 oder WireGuard. Angelegt vom Klick-Betrieb
// (Admin-Netz, Step-up), sichtbar für die Org unter Einstellungen > Netzwerk.
// Umgesetzt vom Netz-Agenten klick-netz über den Job site-tunnels; was der
// Agent meldet, steht in den last_*-Spalten. Zustand (verbunden, getrennt …)
// wird abgeleitet (lib/site-tunnels/rules.ts tunnelState), nie gespeichert.
// Geheimnisse (IPsec-PSK, WireGuard-Schlüssel der Gegenstelle) nur
// feldverschlüsselt (enc1 site_tunnels:<id>:secret_enc), beim Abbau gelöscht.
// Schreiben nur über lib/site-tunnels/service.ts.

export const SITE_TUNNEL_NOTICES = ["connected", "down"] as const;

export const siteTunnels = pgTable(
	"site_tunnels",
	{
		id: pk(),
		organizationId: orgId(),
		// z. B. „Büro Frankfurt“
		name: text().notNull(),
		vendor: text().notNull(),
		tech: text({ enum: ["ipsec", "wireguard"] }).notNull(),
		// öffentliche IPv4 der Gegenstelle (fest)
		peerIp: text().notNull(),
		customerNets: jsonb().$type<string[]>().notNull(),
		// Übergabenetz 10.20.N.0/x, wenn das Netz der Kundin sich überschneidet
		transferNet: text(),
		// WireGuard: öffentlicher Schlüssel der Gegenstelle
		wgPublicKey: text(),
		secretEnc: text(),
		createdBy: userRef(),
		createdAt: ts().notNull().defaultNow(),
		updatedAt: ts().notNull().defaultNow(),
		removedAt: ts(),
		removedBy: userRef(),
		// Agent hat abgebaut (bis dahin schickt der Job `remove`)
		agentRemovedAt: ts(),
		// Beobachtung des Agenten
		connectedAt: ts(),
		downSince: ts(),
		lastUp: boolean(),
		lastHandshakeAt: ts(),
		lastStatusAt: ts(),
		lastError: text(),
		notifiedState: text({ enum: SITE_TUNNEL_NOTICES }),
	},
	(t) => [
		index("site_tunnels_org_idx").on(t.organizationId, t.createdAt),
		// eine Gegenstelle gehört genau einem aktiven Tunnel (über alle Orgs)
		uniqueIndex("site_tunnels_peer_uq")
			.on(t.peerIp)
			.where(sql`removed_at is null`),
		orgPolicy("site_tunnels"),
	],
).enableRLS();

export type SiteTunnel = typeof siteTunnels.$inferSelect;
