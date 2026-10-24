import { Roadmap } from "@wallet/components/landing/roadmap";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Fahrplan",
	description:
		"Was both.money heute kann, was als Nächstes kommt und welche Infrastruktur dafür nötig ist, jeweils mit der Pflicht, auf die es einzahlt.",
};

// Öffentlich, angemeldet wie abgemeldet
export default function RoadmapPage() {
	return <Roadmap />;
}
