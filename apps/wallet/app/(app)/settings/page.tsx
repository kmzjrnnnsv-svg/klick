import { redirect } from "next/navigation";

// Einstellungen: bisher nur der Compliance-Export
export default function SettingsPage() {
	redirect("/settings/export");
}
