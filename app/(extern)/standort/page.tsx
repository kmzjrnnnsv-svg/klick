import type { Metadata } from "next";
import { SitePortal } from "@/components/site-tunnels/site-portal";

// /standort#klk_site_… — Link für die IT (Standort-Tunnel, ADR-033). Ohne
// Konto: der Token im Fragment wird im Browser gegen ein Cookie getauscht,
// die Seite zeigt nur diesen einen Tunnel.

export const metadata: Metadata = {
	title: "Standort verbinden",
	robots: { index: false, follow: false },
	referrer: "no-referrer",
};

export default function SitePortalPage() {
	return <SitePortal />;
}
