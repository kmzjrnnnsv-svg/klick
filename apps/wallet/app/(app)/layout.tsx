import { AppFrame } from "@wallet/components/shell/app-frame";

// Angemeldeter Bereich: Rahmen mit Org-Kontext (components/shell/app-frame)
export default function AppLayout({ children }: { children: React.ReactNode }) {
	return <AppFrame>{children}</AppFrame>;
}
