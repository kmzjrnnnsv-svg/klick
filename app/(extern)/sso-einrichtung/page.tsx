import type { Metadata } from "next";
import { SsoSetupPortal } from "@/components/sso/setup-portal";

// /sso-einrichtung#klk_sso_… — Einrichtungslink für die IT (AP10d). Ohne
// Konto: der Token im Fragment wird im Browser gegen ein Cookie getauscht,
// die Seite zeigt nur die SSO-Werte dieser einen Verbindung.

export const metadata: Metadata = {
	title: "SSO einrichten",
	robots: { index: false, follow: false },
	referrer: "no-referrer",
};

export default function SsoSetupPage() {
	return <SsoSetupPortal />;
}
