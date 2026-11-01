import type { Metadata } from "next";
import { withMessages } from "@/components/i18n/with-messages";
import { SitePortal } from "@/components/site-tunnels/site-portal";

// /standort#klk_site_… — Link für die IT (Standort-Tunnel, ADR-033). Ohne
// Konto: der Token im Fragment wird im Browser gegen ein Cookie getauscht,
// die Seite zeigt nur diesen einen Tunnel.

export const metadata: Metadata = {
	title: "Standort verbinden",
	robots: { index: false, follow: false },
	referrer: "no-referrer",
};

function SitePortalPage() {
	return <SitePortal />;
}

export default withMessages(SitePortalPage, ["Common", "SitePortal"]);
