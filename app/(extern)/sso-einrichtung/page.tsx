import type { Metadata } from "next";
import { withMessages } from "@/components/i18n/with-messages";
import { SsoSetupPortal } from "@/components/sso/setup-portal";

// /sso-einrichtung#klk_sso_… — Einrichtungslink für die IT (AP10d). Ohne
// Konto: der Token im Fragment wird im Browser gegen ein Cookie getauscht,
// die Seite zeigt nur die SSO-Werte dieser einen Verbindung.

export const metadata: Metadata = {
	title: "SSO einrichten",
	robots: { index: false, follow: false },
	referrer: "no-referrer",
};

function SsoSetupPage() {
	return <SsoSetupPortal />;
}

export default withMessages(SsoSetupPage, ["Common", "SsoSetupPortal"]);
