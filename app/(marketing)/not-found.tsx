import { NotFoundContent } from "@/components/shell/not-found-content";

// Unbekannte Slugs unter (marketing): die Fußzeile des Layouts trägt die
// Rechtslinks, daher ohne LegalLinks (sonst doppelt).
export default function MarketingNotFound() {
	return <NotFoundContent />;
}
