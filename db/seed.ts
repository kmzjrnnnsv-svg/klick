import { eq } from "drizzle-orm";
import { computeMatchesForJob } from "../app/actions/matches";
import { db } from "./index";
import {
	candidateProfiles,
	cmsPages,
	employers,
	favorites,
	jobs,
	notifications,
	offers,
	tenants,
	users,
} from "./schema";

const DEMO_TENANT_SLUG = "default";

const DEMO_USERS = {
	admin: {
		email: "admin@klick.local",
		name: "Admin Demo",
		role: "admin" as const,
	},
	company: {
		email: "company@klick.local",
		name: "Camille Roy",
		role: "employer" as const,
	},
	headhunter: {
		email: "headhunter@klick.local",
		name: "Heidi Hartmann",
		role: "employer" as const,
	},
	candidate: {
		email: "candidate@klick.local",
		name: "Kai Sommer",
		role: "candidate" as const,
	},
} as const;

async function ensureTenant(slug: string, name: string): Promise<string> {
	const [existing] = await db
		.select()
		.from(tenants)
		.where(eq(tenants.slug, slug))
		.limit(1);
	if (existing) return existing.id;
	const [created] = await db.insert(tenants).values({ slug, name }).returning();
	return created.id;
}

async function ensureUser(
	tenantId: string,
	demo: {
		email: string;
		name: string;
		role: "admin" | "employer" | "candidate";
	},
): Promise<string> {
	const [existing] = await db
		.select()
		.from(users)
		.where(eq(users.email, demo.email))
		.limit(1);
	if (existing) {
		// Heal: make sure role + tenant are correct (in case the seed expanded).
		if (existing.role !== demo.role || existing.tenantId !== tenantId) {
			await db
				.update(users)
				.set({ role: demo.role, tenantId })
				.where(eq(users.id, existing.id));
		}
		return existing.id;
	}
	const [created] = await db
		.insert(users)
		.values({
			email: demo.email,
			name: demo.name,
			role: demo.role,
			tenantId,
			emailVerified: new Date(),
		})
		.returning();
	return created.id;
}

async function ensureEmployer(
	userId: string,
	tenantId: string,
	companyName: string,
	description: string,
	website?: string,
): Promise<string> {
	const [existing] = await db
		.select()
		.from(employers)
		.where(eq(employers.userId, userId))
		.limit(1);
	if (existing) return existing.id;
	const [created] = await db
		.insert(employers)
		.values({ userId, tenantId, companyName, description, website })
		.returning();
	return created.id;
}

async function ensureJob(
	employerId: string,
	title: string,
	description: string,
	overrides: Partial<typeof jobs.$inferInsert> = {},
): Promise<void> {
	const existing = await db
		.select()
		.from(jobs)
		.where(eq(jobs.employerId, employerId));
	if (existing.some((j) => j.title === title)) return;
	await db.insert(jobs).values({
		employerId,
		title,
		description,
		status: "published",
		...overrides,
	});
}

async function ensureCandidateProfile(
	userId: string,
	data: Partial<typeof candidateProfiles.$inferInsert>,
): Promise<void> {
	const [existing] = await db
		.select()
		.from(candidateProfiles)
		.where(eq(candidateProfiles.userId, userId))
		.limit(1);
	if (existing) return;
	await db.insert(candidateProfiles).values({
		userId,
		visibility: "matches_only",
		// Seeded demo accounts are "ready to go" — skip the onboarding wizard.
		onboardingCompletedAt: new Date(),
		...data,
	});
}

// Extra candidates beyond the primary candidate@klick.local — populate the
// match list so employers see varied profiles when they sign in. Mix of
// junior / senior / freelancer / designer and different employment types.
const EXTRA_CANDIDATES: Array<{
	email: string;
	name: string;
	profile: Partial<typeof candidateProfiles.$inferInsert>;
}> = [
	{
		email: "junior.dev@klick.local",
		name: "Lara Weiss",
		profile: {
			displayName: "Lara Weiss",
			headline: "Junior Frontend Engineer",
			location: "Leipzig",
			yearsExperience: 1,
			salaryMin: 48000,
			languages: ["Deutsch", "Englisch"],
			skills: [
				{ name: "TypeScript", level: 3 },
				{ name: "React", level: 3 },
				{ name: "Tailwind CSS", level: 4 },
				{ name: "Vite", level: 3 },
			],
			experience: [
				{
					company: "Junges Studio GmbH",
					role: "Junior Frontend Engineer",
					start: "2024-09",
					description: "Erstes festes Engagement nach Werkstudent-Phase.",
					employmentType: "employee",
				},
				{
					company: "HTW Berlin",
					role: "Werkstudent UI",
					start: "2023-04",
					end: "2024-08",
					description: "Komponenten-Bibliothek für interne Tools.",
					employmentType: "internship",
				},
			],
			education: [
				{
					institution: "HTW Berlin",
					degree: "B.Sc. Wirtschaftsinformatik",
					start: "2020",
					end: "2024",
				},
			],
			summary:
				"Frische Absolventin mit Fokus auf moderne Frontend-Stacks und Design-Tokens.",
			industries: ["EdTech"],
			preferredRoleLevel: "junior",
			mobility: "Hybrid Berlin / Leipzig",
		},
	},
	{
		email: "lead.dev@klick.local",
		name: "Marko Petrović",
		profile: {
			displayName: "Marko Petrović",
			headline: "Engineering Manager — Plattform",
			location: "Hamburg",
			yearsExperience: 13,
			salaryMin: 110000,
			languages: ["Deutsch", "Englisch", "Serbisch"],
			skills: [
				{ name: "Engineering Management", level: 5 },
				{ name: "TypeScript", level: 4 },
				{ name: "Node.js", level: 5 },
				{ name: "PostgreSQL", level: 5 },
				{ name: "Kubernetes", level: 4 },
				{ name: "AWS", level: 4 },
			],
			experience: [
				{
					company: "FinTech Nord AG",
					role: "Engineering Manager",
					start: "2021-03",
					description:
						"Plattform-Team mit 9 Engineers, Fokus Zahlungsverkehr und Compliance.",
					employmentType: "employee",
				},
				{
					company: "Petrović Consulting (eigene Gründung)",
					role: "Founder & Principal Engineer",
					start: "2018-06",
					end: "2021-02",
					description:
						"Eigene Beratungs-GmbH, B2B-Plattformen für 3 Mittelständler.",
					employmentType: "founder",
				},
				{
					company: "ScaleUp GmbH",
					role: "Senior Backend Engineer",
					start: "2014-01",
					end: "2018-05",
					employmentType: "employee",
				},
			],
			education: [
				{
					institution: "Uni Hamburg",
					degree: "M.Sc. Informatik",
					start: "2009",
					end: "2013",
				},
			],
			summary:
				"Skaliert Plattform-Teams in regulierten Märkten. Hands-on bei Architektur, Mentor:in für Engineers in 3 Karrierestufen.",
			industries: ["Fintech", "Compliance"],
			awards: ["DACH Tech Lead of the Year 2023 (Shortlist)"],
			preferredRoleLevel: "lead",
			mobility: "Hybrid Hamburg / 1 Tag Remote-OK",
		},
	},
	{
		email: "designer@klick.local",
		name: "Aylin Demir",
		profile: {
			displayName: "Aylin Demir",
			headline: "Product Designer — Design Systems",
			location: "Berlin",
			yearsExperience: 6,
			salaryMin: 70000,
			languages: ["Deutsch", "Englisch", "Türkisch"],
			skills: [
				{ name: "Figma", level: 5 },
				{ name: "Design Systems", level: 5 },
				{ name: "Prototyping", level: 5 },
				{ name: "Accessibility", level: 4 },
				{ name: "UX Research", level: 3 },
			],
			experience: [
				{
					company: "Studio Demir",
					role: "Selbstständige Product Designerin",
					start: "2022-04",
					description: "Eigene Auftragsbasis mit Scale-up-Kunden.",
					employmentType: "self_employed",
				},
				{
					company: "ClickHaus AG",
					role: "Senior Product Designer",
					start: "2019-08",
					end: "2022-03",
					description: "Design-System für SaaS-Produkt mit 6 Squads.",
					employmentType: "employee",
				},
			],
			education: [
				{
					institution: "UdK Berlin",
					degree: "M.A. Visual Communication",
					start: "2017",
					end: "2019",
				},
			],
			summary:
				"Baut Design-Systeme die Engineering wirklich nutzt. Brücke zwischen Brand und Code.",
			industries: ["SaaS", "B2B"],
			preferredRoleLevel: "senior",
			mobility: "Remote / EU-Zeitzonen",
		},
	},
	{
		email: "freelancer@klick.local",
		name: "Tom Becker",
		profile: {
			displayName: "Tom Becker",
			headline: "Freelance Fullstack Engineer",
			location: "Köln",
			yearsExperience: 9,
			salaryMin: 0,
			languages: ["Deutsch", "Englisch"],
			skills: [
				{ name: "TypeScript", level: 5 },
				{ name: "Next.js", level: 5 },
				{ name: "Node.js", level: 5 },
				{ name: "PostgreSQL", level: 4 },
				{ name: "AWS", level: 4 },
				{ name: "Stripe", level: 4 },
			],
			experience: [
				{
					company: "Tom Becker — Freelance",
					role: "Freelance Fullstack Engineer",
					start: "2019-01",
					description:
						"~7 abgeschlossene Projekte für DACH-Scale-ups, MRR-Wachstum + Migrations.",
					employmentType: "freelance",
				},
				{
					company: "Becker Software UG",
					role: "Founder & Engineer",
					start: "2016-04",
					end: "2018-12",
					description: "Eigene UG, B2C-Marketplace, später eingestellt.",
					employmentType: "founder",
				},
			],
			education: [
				{
					institution: "Uni zu Köln",
					degree: "B.Sc. Wirtschaftsinformatik",
					start: "2012",
					end: "2015",
				},
			],
			summary:
				"Liefert produktnahe Full-Stack-Features auf Auftragsbasis. Stack TypeScript-only, monorepo-affin.",
			industries: ["E-Commerce", "SaaS"],
			preferredRoleLevel: "senior",
			mobility: "Remote nur, kein On-Site",
		},
	},
	{
		email: "devops@klick.local",
		name: "Sebastian Reuter",
		profile: {
			displayName: "Sebastian Reuter",
			headline: "Staff DevOps / Platform Engineer",
			location: "München",
			yearsExperience: 11,
			salaryMin: 95000,
			languages: ["Deutsch", "Englisch"],
			skills: [
				{ name: "Kubernetes", level: 5 },
				{ name: "AWS", level: 5 },
				{ name: "Terraform", level: 5 },
				{ name: "Linux", level: 5 },
				{ name: "Go", level: 4 },
				{ name: "PostgreSQL", level: 4 },
			],
			experience: [
				{
					company: "BavariaCloud GmbH",
					role: "Staff Platform Engineer",
					start: "2020-05",
					description:
						"Multi-Region-Plattform für 300+ interne Services, on-call Lead.",
					employmentType: "employee",
				},
				{
					company: "OpsHaus GmbH",
					role: "DevOps Engineer",
					start: "2014-09",
					end: "2020-04",
					description: "Ansible→Terraform-Migration, K8s-Onboarding.",
					employmentType: "employee",
				},
			],
			education: [
				{
					institution: "TU München",
					degree: "M.Sc. Informatik",
					start: "2010",
					end: "2014",
				},
			],
			summary:
				"Hands-on Platform-Engineer für regulierte Cloud-Umgebungen. SLO-getrieben, kein Hype-Stack.",
			industries: ["Cloud", "Enterprise SaaS"],
			preferredRoleLevel: "principal",
			mobility: "Hybrid München, 2 Tage Office",
		},
	},
	{
		email: "data@klick.local",
		name: "Sofia Romano",
		profile: {
			displayName: "Sofia Romano",
			headline: "Senior Data Engineer",
			location: "Wien",
			yearsExperience: 8,
			salaryMin: 78000,
			languages: ["Deutsch", "Englisch", "Italienisch"],
			skills: [
				{ name: "Python", level: 5 },
				{ name: "SQL", level: 5 },
				{ name: "Apache Airflow", level: 4 },
				{ name: "dbt", level: 4 },
				{ name: "Snowflake", level: 4 },
				{ name: "Spark", level: 3 },
			],
			experience: [
				{
					company: "DataDeck AG",
					role: "Senior Data Engineer",
					start: "2022-02",
					description: "Owns das ETL-Layer + DataMesh für Marketing-Analytics.",
					employmentType: "employee",
				},
				{
					company: "Romano Analytics e.U.",
					role: "Selbstständige Data Engineer",
					start: "2018-08",
					end: "2022-01",
					description: "EU-Förderprojekte mit Public-Sector-Kunden.",
					employmentType: "self_employed",
				},
			],
			education: [
				{
					institution: "TU Wien",
					degree: "M.Sc. Data Science",
					start: "2014",
					end: "2017",
				},
			],
			summary:
				"Baut robuste Daten-Pipelines, die auch bei Schema-Drift nicht kollabieren. SQL-first, Python für glue.",
			industries: ["Adtech", "Public Sector"],
			preferredRoleLevel: "senior",
			mobility: "Hybrid Wien / Remote-OK in CET",
		},
	},
	{
		email: "backend.java@klick.local",
		name: "Erik Lindqvist",
		profile: {
			displayName: "Erik Lindqvist",
			headline: "Principal Backend Engineer (Java/Kotlin)",
			location: "Stuttgart",
			yearsExperience: 15,
			salaryMin: 105000,
			languages: ["Deutsch", "Englisch", "Schwedisch"],
			skills: [
				{ name: "Java", level: 5 },
				{ name: "Kotlin", level: 5 },
				{ name: "Spring Boot", level: 5 },
				{ name: "Kafka", level: 4 },
				{ name: "PostgreSQL", level: 5 },
				{ name: "AWS", level: 3 },
			],
			experience: [
				{
					company: "AutoMobile AG",
					role: "Principal Engineer",
					start: "2017-04",
					description:
						"Backbone-Service für Fahrzeug-Telemetrie, 200k events/sec peak.",
					employmentType: "employee",
				},
				{
					company: "Telekom IT",
					role: "Senior Engineer",
					start: "2010-06",
					end: "2017-03",
					employmentType: "employee",
				},
			],
			education: [
				{
					institution: "KTH Stockholm",
					degree: "M.Sc. Computer Science",
					start: "2005",
					end: "2010",
				},
			],
			summary:
				"Backend-Architektur für Massendaten + harte Latenzen. Mentor für Junior-Engineers in JVM-Stacks.",
			industries: ["Automotive", "Telco"],
			preferredRoleLevel: "principal",
			mobility: "Hybrid Stuttgart / 1 Tag Remote",
		},
	},
	{
		email: "mobile@klick.local",
		name: "Nina Garcia",
		profile: {
			displayName: "Nina Garcia",
			headline: "Senior Mobile Engineer (iOS + React Native)",
			location: "Barcelona",
			yearsExperience: 7,
			salaryMin: 72000,
			languages: ["Englisch", "Spanisch", "Deutsch"],
			skills: [
				{ name: "Swift", level: 5 },
				{ name: "React Native", level: 5 },
				{ name: "TypeScript", level: 4 },
				{ name: "iOS", level: 5 },
				{ name: "Android", level: 3 },
				{ name: "GraphQL", level: 3 },
			],
			experience: [
				{
					company: "MoveApp SL",
					role: "Senior Mobile Engineer",
					start: "2021-09",
					description: "Cross-Platform-App, 2M MAU, App-Store-Rating 4.7.",
					employmentType: "employee",
				},
				{
					company: "Garcia Studio",
					role: "Freelance Mobile Engineer",
					start: "2019-01",
					end: "2021-08",
					description: "Eigene Aufträge, Schwerpunkt Health + FinTech-Apps.",
					employmentType: "freelance",
				},
			],
			education: [
				{
					institution: "Universitat Pompeu Fabra",
					degree: "B.Sc. Computer Engineering",
					start: "2014",
					end: "2018",
				},
			],
			summary:
				"Mobile-First-Engineer mit Auge für UX-Details. Versendet Apps, die im Store oben stehen.",
			industries: ["Health Tech", "Fintech"],
			preferredRoleLevel: "senior",
			mobility: "Remote in CET +/- 2h",
		},
	},
	{
		email: "growth@klick.local",
		name: "Jakob Hoffmann",
		profile: {
			displayName: "Jakob Hoffmann",
			headline: "Growth Marketing Lead",
			location: "Berlin",
			yearsExperience: 10,
			salaryMin: 85000,
			languages: ["Deutsch", "Englisch"],
			skills: [
				{ name: "Performance Marketing", level: 5 },
				{ name: "SEO", level: 5 },
				{ name: "Content Strategy", level: 4 },
				{ name: "Analytics", level: 5 },
				{ name: "HubSpot", level: 4 },
			],
			experience: [
				{
					company: "GrowthBox AG",
					role: "Head of Growth",
					start: "2021-01",
					description: "B2B-SaaS, von 200k zu 1.4M ARR in 2 Jahren skaliert.",
					employmentType: "employee",
				},
				{
					company: "Hoffmann & Partner GbR",
					role: "Mitgründer & Marketer",
					start: "2017-04",
					end: "2020-12",
					description: "Eigene Performance-Marketing-Agentur, 3 Mitarbeitende.",
					employmentType: "founder",
				},
				{
					company: "BurgerWerk",
					role: "Counter-Aushilfe (nebenher)",
					start: "2015-06",
					end: "2017-03",
					description: "Studienbegleitend, fachfremd.",
					employmentType: "other",
				},
			],
			education: [
				{
					institution: "FU Berlin",
					degree: "M.Sc. Marketing & Innovation",
					start: "2014",
					end: "2017",
				},
			],
			summary:
				"Treibt Wachstum mit Daten + Content. Versteht Funnel-Mechanik genauso wie SEO-Trends.",
			industries: ["B2B SaaS", "E-Commerce"],
			awards: ["B2B Growth Hacker of the Year 2023 (Top 10)"],
			preferredRoleLevel: "lead",
			mobility: "Berlin Hybrid / 2 Tage Remote",
		},
	},
];

async function ensureCmsStubs(tenantId: string): Promise<void> {
	// Footer linkt auf /datenschutz und /impressum — der Catch-All
	// (app/(marketing)/[slug]/page.tsx) liest aus cms_pages. Ohne Stubs
	// bekommt jeder Klick eine 404. onConflictDoNothing: einmal angelegt,
	// nie überschrieben — Admins können das jederzeit unter /admin/cms
	// editieren.
	const stubs: Array<{ slug: string; title: string; body: string }> = [
		{
			slug: "impressum",
			title: "Impressum",
			body: "Pflicht-Platzhalter. Trag hier unter /admin/cms die echten Angaben nach §5 TMG ein: Anbieter, Anschrift, Vertretungsberechtigte, Kontakt, Handelsregister, USt-IdNr. (falls vorhanden).",
		},
		{
			slug: "datenschutz",
			title: "Datenschutz",
			body: "Pflicht-Platzhalter. Trag hier unter /admin/cms die Datenschutzerklärung nach DSGVO ein: Verantwortlicher, Datenkategorien, Rechtsgrundlage, Speicherdauer, Empfänger, Betroffenenrechte, Datenschutzbeauftragte:r (falls vorhanden), Beschwerderecht.",
		},
	];
	for (const s of stubs) {
		await db
			.insert(cmsPages)
			.values({ tenantId, ...s })
			.onConflictDoNothing();
	}
}

async function main() {
	const tenantId = await ensureTenant(DEMO_TENANT_SLUG, "Default Workspace");
	console.log(`✔ tenant '${DEMO_TENANT_SLUG}' (id=${tenantId})`);

	await ensureCmsStubs(tenantId);
	console.log("✔ cms stubs (impressum, datenschutz) — idempotent");

	const adminId = await ensureUser(tenantId, DEMO_USERS.admin);
	console.log(`✔ admin   ${DEMO_USERS.admin.email} (id=${adminId})`);

	const companyUserId = await ensureUser(tenantId, DEMO_USERS.company);
	const companyEmployerId = await ensureEmployer(
		companyUserId,
		tenantId,
		"Acme Studios GmbH",
		"Wir entwickeln Werkzeuge für kreative Teams und sind immer auf der Suche nach Frontend-Talenten.",
		"https://example.com/acme",
	);
	await ensureJob(
		companyEmployerId,
		"Senior Frontend Engineer (m/w/d)",
		"Du baust unser Design-System weiter aus, optimierst Performance und treibst die DX im Team voran. Stack: TypeScript, React, Next.js, Tailwind.",
		{
			location: "Berlin",
			remotePolicy: "hybrid",
			employmentType: "fulltime",
			salaryMin: 75000,
			salaryMax: 95000,
			yearsExperienceMin: 4,
			languages: ["Deutsch", "Englisch"],
			requirements: [
				{ name: "TypeScript", weight: "must", minLevel: 4 },
				{ name: "React", weight: "must", minLevel: 4 },
				{ name: "Next.js", weight: "nice", minLevel: 3 },
				{ name: "Tailwind CSS", weight: "nice" },
			],
		},
	);
	await ensureJob(
		companyEmployerId,
		"Junior Frontend Engineer (Remote / EU)",
		"Erste Festanstellung nach Studium oder Werkstudent? Komm an Bord. Wir pairen viel und erwarten keine 'Senior von Tag 1'-Werbeversprechen.",
		{
			location: "Remote / EU",
			remotePolicy: "remote",
			employmentType: "fulltime",
			salaryMin: 48000,
			salaryMax: 58000,
			yearsExperienceMin: 0,
			languages: ["Deutsch", "Englisch"],
			requirements: [
				{ name: "TypeScript", weight: "must", minLevel: 2 },
				{ name: "React", weight: "must", minLevel: 2 },
				{ name: "Tailwind CSS", weight: "nice" },
			],
		},
	);
	await ensureJob(
		companyEmployerId,
		"Product Designer — Design Systems",
		"Du übernimmst unser Design-System, arbeitest eng mit drei Engineering-Squads, ownst Komponenten + Tokens.",
		{
			location: "Berlin",
			remotePolicy: "hybrid",
			employmentType: "fulltime",
			salaryMin: 65000,
			salaryMax: 85000,
			yearsExperienceMin: 4,
			languages: ["Deutsch", "Englisch"],
			requirements: [
				{ name: "Figma", weight: "must", minLevel: 4 },
				{ name: "Design Systems", weight: "must", minLevel: 4 },
				{ name: "Accessibility", weight: "nice" },
			],
		},
	);
	console.log(
		`✔ company ${DEMO_USERS.company.email} (employer=${companyEmployerId})`,
	);

	const headhunterUserId = await ensureUser(tenantId, DEMO_USERS.headhunter);
	const headhunterEmployerId = await ensureEmployer(
		headhunterUserId,
		tenantId,
		"Talent Hunters AG",
		"Spezialisierte Personalberatung. Wir vermitteln Senior-Engineering-Profile an europäische Scale-ups.",
		"https://example.com/talenthunters",
	);
	await ensureJob(
		headhunterEmployerId,
		"Engineering Manager — namhaftes Fintech",
		"Im Auftrag eines etablierten Fintech-Unternehmens (Kundenname auf Anfrage) suchen wir eine Engineering Manager:in für ein 8-köpfiges Plattform-Team.",
		{
			location: "Frankfurt",
			remotePolicy: "remote",
			employmentType: "fulltime",
			salaryMin: 95000,
			salaryMax: 130000,
			yearsExperienceMin: 6,
			languages: ["Deutsch", "Englisch"],
			requirements: [
				{ name: "Engineering Management", weight: "must", minLevel: 4 },
				{ name: "Node.js", weight: "must", minLevel: 4 },
				{ name: "PostgreSQL", weight: "nice", minLevel: 3 },
				{ name: "Kubernetes", weight: "nice" },
			],
		},
	);
	await ensureJob(
		headhunterEmployerId,
		"Freelance Fullstack — 6-Monats-Projekt",
		"Im Auftrag eines DACH-Scale-ups: Migration eines bestehenden React-SPA auf Next.js mit Stripe-Integration und Postgres-Backend. 6 Monate, vollständig remote.",
		{
			location: "Remote / EU",
			remotePolicy: "remote",
			employmentType: "contract",
			salaryMin: 0,
			salaryMax: 0,
			yearsExperienceMin: 5,
			languages: ["Deutsch", "Englisch"],
			requirements: [
				{ name: "Next.js", weight: "must", minLevel: 4 },
				{ name: "TypeScript", weight: "must", minLevel: 4 },
				{ name: "Stripe", weight: "must", minLevel: 3 },
				{ name: "PostgreSQL", weight: "nice" },
			],
		},
	);
	await ensureJob(
		headhunterEmployerId,
		"Backend Lead — JVM-Stack",
		"Im Auftrag eines Stuttgarter Mittelständlers: Backend-Lead für eine Plattform mit hohen Latenzanforderungen. Stack: Java oder Kotlin, Spring Boot, Kafka, PostgreSQL.",
		{
			location: "Stuttgart",
			remotePolicy: "hybrid",
			employmentType: "fulltime",
			salaryMin: 90000,
			salaryMax: 115000,
			yearsExperienceMin: 8,
			languages: ["Deutsch", "Englisch"],
			requirements: [
				{ name: "Java", weight: "must", minLevel: 4 },
				{ name: "Spring Boot", weight: "must", minLevel: 4 },
				{ name: "Kafka", weight: "nice" },
				{ name: "PostgreSQL", weight: "nice" },
			],
		},
	);
	await ensureJob(
		headhunterEmployerId,
		"Lead Mobile Engineer — iOS + RN",
		"Cross-Platform-App eines DACH-Health-Scale-ups, 2M MAU. Suchen Lead für 4-köpfiges Mobile-Team.",
		{
			location: "Remote / EU",
			remotePolicy: "remote",
			employmentType: "fulltime",
			salaryMin: 80000,
			salaryMax: 100000,
			yearsExperienceMin: 6,
			languages: ["Englisch"],
			requirements: [
				{ name: "Swift", weight: "must", minLevel: 4 },
				{ name: "React Native", weight: "must", minLevel: 4 },
				{ name: "iOS", weight: "must", minLevel: 4 },
				{ name: "TypeScript", weight: "nice" },
			],
		},
	);
	console.log(
		`✔ headhunter ${DEMO_USERS.headhunter.email} (employer=${headhunterEmployerId})`,
	);

	// Two more Acme-side roles so the data + growth candidates also have a
	// strong match in the demo data.
	await ensureJob(
		companyEmployerId,
		"Senior Data Engineer (m/w/d)",
		"Du baust unser ETL-Layer für Marketing-Analytics aus, ownst Daten-Pipelines und arbeitest eng mit dem Data-Science-Team.",
		{
			location: "Berlin",
			remotePolicy: "hybrid",
			employmentType: "fulltime",
			salaryMin: 75000,
			salaryMax: 95000,
			yearsExperienceMin: 5,
			languages: ["Deutsch", "Englisch"],
			requirements: [
				{ name: "Python", weight: "must", minLevel: 4 },
				{ name: "SQL", weight: "must", minLevel: 4 },
				{ name: "Apache Airflow", weight: "nice" },
				{ name: "dbt", weight: "nice" },
				{ name: "Snowflake", weight: "nice" },
			],
		},
	);
	await ensureJob(
		companyEmployerId,
		"Growth Marketing Manager",
		"Du übernimmst Performance-Marketing + SEO + Content für unser B2B-SaaS. Eng mit Sales und Produkt verzahnt.",
		{
			location: "Berlin",
			remotePolicy: "hybrid",
			employmentType: "fulltime",
			salaryMin: 70000,
			salaryMax: 90000,
			yearsExperienceMin: 5,
			languages: ["Deutsch", "Englisch"],
			requirements: [
				{ name: "Performance Marketing", weight: "must", minLevel: 4 },
				{ name: "SEO", weight: "must", minLevel: 4 },
				{ name: "Analytics", weight: "must", minLevel: 4 },
				{ name: "HubSpot", weight: "nice" },
			],
		},
	);

	const candidateUserId = await ensureUser(tenantId, DEMO_USERS.candidate);
	await ensureCandidateProfile(candidateUserId, {
		displayName: "Kai Sommer",
		headline: "Senior Frontend Engineer",
		location: "Berlin",
		yearsExperience: 7,
		salaryMin: 75000,
		languages: ["Deutsch", "Englisch"],
		skills: [
			{ name: "TypeScript", level: 5 },
			{ name: "React", level: 5 },
			{ name: "Next.js", level: 4 },
			{ name: "Tailwind CSS", level: 4 },
			{ name: "Node.js", level: 3 },
		],
		experience: [
			{
				company: "Beispiel GmbH",
				role: "Senior Frontend Engineer",
				start: "2022-01",
				description:
					"Verantwortlich für das Design-System und Performance-Initiativen.",
				employmentType: "employee",
			},
			{
				company: "Klick.work (eigene Gründung)",
				role: "Co-Founder & CTO",
				start: "2020-09",
				end: "2021-12",
				description: "Eigene Gründung, B2B-SaaS für Recruiting-Workflows.",
				employmentType: "founder",
			},
			{
				company: "Demo AG",
				role: "Frontend Engineer",
				start: "2019-06",
				end: "2020-08",
				description: "Migration von jQuery-Stack auf React + TypeScript.",
				employmentType: "employee",
			},
			{
				company: "Café Mittel",
				role: "Servicekraft (Werkstudent)",
				start: "2017-10",
				end: "2019-05",
				description:
					"Studienbegleitend, fachfremd. Schichtleitung der Wochenend-Crew.",
				employmentType: "other",
			},
		],
		education: [
			{
				institution: "TU München",
				degree: "M.Sc. Informatik",
				start: "2017",
				end: "2019",
			},
		],
		summary:
			"Frontend-Spezialist mit Schwerpunkt Design-Systeme, Performance und Developer Experience.",
	});
	console.log(
		`✔ candidate ${DEMO_USERS.candidate.email} (user=${candidateUserId})`,
	);

	for (const extra of EXTRA_CANDIDATES) {
		const id = await ensureUser(tenantId, {
			email: extra.email,
			name: extra.name,
			role: "candidate",
		});
		await ensureCandidateProfile(id, extra.profile);
		console.log(`✔ candidate ${extra.email} (user=${id})`);
	}

	// ── Cross-product matching + demo favorites + demo offers ─────────────
	// The match engine needs to run per published job, so all candidates
	// appear with scores in the employer view. Idempotent: re-runs upsert.
	console.log("\nComputing matches across all candidates × jobs…");
	const allJobs = await db
		.select()
		.from(jobs)
		.where(eq(jobs.status, "published"));
	for (const j of allJobs) {
		try {
			await computeMatchesForJob(j.id);
		} catch (e) {
			console.warn(`  matches for ${j.title} skipped: ${(e as Error).message}`);
		}
	}
	console.log(`✔ matched ${allJobs.length} published jobs`);

	// Pick the company employer (Acme Studios) for demo favorites + offers.
	const [acme] = await db
		.select()
		.from(employers)
		.where(eq(employers.userId, await ensureUser(tenantId, DEMO_USERS.company)))
		.limit(1);
	const [headhunterEmp] = await db
		.select()
		.from(employers)
		.where(
			eq(employers.userId, await ensureUser(tenantId, DEMO_USERS.headhunter)),
		)
		.limit(1);

	if (acme && allJobs.length > 0) {
		// 3-4 favorites on Acme's jobs — pick varied candidates.
		const acmeJobs = allJobs.filter((j) => j.employerId === acme.id);
		const candidatesAll = await db
			.select({
				userId: candidateProfiles.userId,
				name: candidateProfiles.displayName,
			})
			.from(candidateProfiles)
			.limit(20);

		const favPicks: Array<{
			job: (typeof acmeJobs)[number];
			cand: (typeof candidatesAll)[number];
			notes: string;
		}> = [];
		for (
			let i = 0;
			i < Math.min(4, acmeJobs.length, candidatesAll.length);
			i++
		) {
			favPicks.push({
				job: acmeJobs[i % acmeJobs.length],
				cand: candidatesAll[i],
				notes: [
					"Profil passt perfekt — Senior-Background sichtbar.",
					"Quereinsteiger, aber starkes Portfolio.",
					"Pendelweg knapp, Skills aber ideal.",
					"Würde ich gern für ein erstes Gespräch.",
				][i],
			});
		}
		for (const p of favPicks) {
			await db
				.insert(favorites)
				.values({
					employerId: acme.id,
					jobId: p.job.id,
					candidateUserId: p.cand.userId,
					notes: p.notes,
				})
				.onConflictDoNothing();
		}
		console.log(`✔ ${favPicks.length} demo favorites added`);

		// Two demo offers: one pending (fresh), one accepted (closed).
		if (acmeJobs[0] && candidatesAll[0] && candidatesAll[1]) {
			const expires = new Date();
			expires.setDate(expires.getDate() + 14);

			// Pending offer to candidate #1
			const [pending] = await db
				.insert(offers)
				.values({
					jobId: acmeJobs[0].id,
					employerId: acme.id,
					candidateUserId: candidatesAll[0].userId,
					roleTitle: acmeJobs[0].title,
					salaryProposed:
						acmeJobs[0].salaryMax ?? acmeJobs[0].salaryMin ?? 75000,
					startDateProposed: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
					message:
						"Wir wären begeistert, dich bei Acme willkommen zu heißen — das Team passt zu dir.",
					expiresAt: expires,
				})
				.onConflictDoNothing()
				.returning({ id: offers.id });

			if (pending) {
				await db
					.insert(notifications)
					.values({
						userId: candidatesAll[0].userId,
						kind: "new_offer",
						title: `${acme.companyName} hat dir ein Angebot gemacht`,
						body: `${acmeJobs[0].title} — Demo-Angebot`,
						link: `/offers/${pending.id}`,
					})
					.onConflictDoNothing();
			}

			// Accepted offer to candidate #1 on a different job (history).
			if (acmeJobs[1]) {
				await db
					.insert(offers)
					.values({
						jobId: acmeJobs[1].id,
						employerId: acme.id,
						candidateUserId: candidatesAll[1].userId,
						roleTitle: acmeJobs[1].title,
						salaryProposed:
							acmeJobs[1].salaryMax ?? acmeJobs[1].salaryMin ?? 70000,
						status: "accepted",
						decidedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
						decidedMessage: "Sehr gerne — freue mich auf die Gespräche.",
					})
					.onConflictDoNothing();
			}
		}

		// One offer from headhunter — to demo agency-vs-employer flow.
		if (headhunterEmp && allJobs[0] && candidatesAll[2]) {
			const [hhJob] = allJobs.filter((j) => j.employerId === headhunterEmp.id);
			if (hhJob) {
				await db
					.insert(offers)
					.values({
						jobId: hhJob.id,
						employerId: headhunterEmp.id,
						candidateUserId: candidatesAll[2].userId,
						roleTitle: hhJob.title,
						salaryProposed: hhJob.salaryMax ?? hhJob.salaryMin ?? 90000,
						message:
							"Im Auftrag eines Kunden im Mittelstand — wir vermitteln den Erstkontakt.",
					})
					.onConflictDoNothing();
			}
		}

		console.log(
			"✔ demo offers added (1 pending, 1 accepted, 1 via headhunter)",
		);
	}

	console.log(
		"\nDemo-Login (mit ENABLE_DEMO_LOGIN=true): /api/demo-login?role=<admin|company|headhunter|candidate>",
	);
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.then(() => process.exit(0));
