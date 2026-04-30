import { eq } from "drizzle-orm";
import { db } from "./index";
import { candidateProfiles, employers, jobs, tenants, users } from "./schema";

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
	demo: (typeof DEMO_USERS)[keyof typeof DEMO_USERS],
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

async function ensureCandidateProfile(userId: string): Promise<void> {
	const [existing] = await db
		.select()
		.from(candidateProfiles)
		.where(eq(candidateProfiles.userId, userId))
		.limit(1);
	if (existing) return;
	await db.insert(candidateProfiles).values({
		userId,
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
			},
			{
				company: "Demo AG",
				role: "Frontend Engineer",
				start: "2019-06",
				end: "2021-12",
				description: "Migration von jQuery-Stack auf React + TypeScript.",
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
		visibility: "matches_only",
	});
}

async function main() {
	const tenantId = await ensureTenant(DEMO_TENANT_SLUG, "Default Workspace");
	console.log(`✔ tenant '${DEMO_TENANT_SLUG}' (id=${tenantId})`);

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
				{ name: "People Management", weight: "must" },
				{ name: "Backend", weight: "must" },
				{ name: "Fintech-Erfahrung", weight: "nice" },
			],
		},
	);
	console.log(
		`✔ headhunter ${DEMO_USERS.headhunter.email} (employer=${headhunterEmployerId})`,
	);

	const candidateUserId = await ensureUser(tenantId, DEMO_USERS.candidate);
	await ensureCandidateProfile(candidateUserId);
	console.log(
		`✔ candidate ${DEMO_USERS.candidate.email} (user=${candidateUserId})`,
	);

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
