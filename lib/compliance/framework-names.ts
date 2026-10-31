import { CATALOG_FRAMEWORKS } from "./catalog";

// Kurzname eines Rahmenwerks (pure): „ISO/IEC 27001:2022“ → „ISO 27001“,
// „DORA — …“ → „DORA“
export function shortFrameworkName(slug: string): string {
	const f = CATALOG_FRAMEWORKS.find((x) => x.slug === slug);
	if (!f) return slug;
	return (
		f.name
			.split(" — ")[0]
			?.replace("ISO/IEC ", "ISO ")
			.replace(/:\d{4}$/, "") ?? f.name
	);
}

// Ganz kurze Namen für enge Stellen (Übersicht, Achsen); sonst der Kurzname
const MAP_NAMES: Record<string, string> = {
	iso27001: "ISO 27001",
	nis2: "NIS2",
	micar: "MiCAR",
	zag: "ZAG",
	gwg: "GwG",
	tfr: "Travel Rule",
	sanctions: "Sanktionen",
	dsgvo: "DSGVO",
	kassen: "Kassenrecht",
	kwg: "KWG",
	cra: "CRA",
	soc2: "SOC 2",
	ccss: "CCSS",
	"pci-dss": "PCI DSS",
	"bsi-200-1": "BSI 200-1",
	"bsi-200-2": "BSI 200-2",
	"bsi-200-3": "BSI 200-3",
	"bsi-200-4": "BSI 200-4",
	amlr: "AMLR",
	tisax: "TISAX",
	"eu-us-dpf": "EU-US DPF",
	"cyber-essentials": "Cyber Essentials",
	"essential-eight": "Essential Eight",
	dora: "DORA",
	"zag-marisk": "ZAG-MaRisk",
	awv: "AWV",
	dac8: "DAC8",
	"uk-fca": "UK",
	"ae-vara": "VAE",
	"bh-cbb": "Bahrain",
	"ch-finma": "Schweiz",
	"br-bcb": "Brasilien",
};

export function mapFrameworkName(slug: string): string {
	return MAP_NAMES[slug] ?? shortFrameworkName(slug);
}
