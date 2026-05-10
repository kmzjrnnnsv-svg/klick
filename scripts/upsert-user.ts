// Production-tauglicher User-Upsert. Legt einen User an wenn noch nicht da,
// setzt sonst die Rolle. Unterscheidet sich bewusst von set-role.ts (das
// nur updated und failt wenn der User fehlt) — dieses Script ist für den
// initialen Admin-Bootstrap auf einem frischen Server gedacht.
//
// Usage:
//   pnpm tsx scripts/upsert-user.ts <email> <candidate|employer|admin> [name]
//
// Beispiel:
//   pnpm tsx scripts/upsert-user.ts halloqasim@raza.work admin "Qasim"
//
// Tenant-Logik:
//   - Wenn der User existiert: Tenant bleibt, nur Rolle ändert sich.
//   - Wenn neu: wird dem Default-Tenant (`DEFAULT_TENANT_SLUG` oder
//     "default") zugeordnet. Auf Production mit Subdomain-Routing kannst
//     du den Tenant später per UI/SQL umhängen.
import { eq } from "drizzle-orm";
import { db } from "../db";
import { tenants, users } from "../db/schema";

const VALID_ROLES = ["candidate", "employer", "admin"] as const;
type Role = (typeof VALID_ROLES)[number];

async function defaultTenantId(): Promise<string> {
	const slug = process.env.DEFAULT_TENANT_SLUG ?? "default";
	const [t] = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
	if (t) return t.id;
	const [created] = await db
		.insert(tenants)
		.values({ slug, name: "Default Workspace" })
		.returning();
	return created.id;
}

async function main() {
	const [email, roleRaw, name] = process.argv.slice(2);
	if (!email || !roleRaw) {
		console.error(
			"Usage: pnpm tsx scripts/upsert-user.ts <email> <candidate|employer|admin> [name]",
		);
		process.exit(1);
	}
	if (!VALID_ROLES.includes(roleRaw as Role)) {
		console.error(`Role must be one of ${VALID_ROLES.join("|")}, got: ${roleRaw}`);
		process.exit(1);
	}
	const role = roleRaw as Role;
	const normalizedEmail = email.trim().toLowerCase();

	const [existing] = await db
		.select()
		.from(users)
		.where(eq(users.email, normalizedEmail))
		.limit(1);

	if (existing) {
		const [updated] = await db
			.update(users)
			.set({ role, ...(name ? { name } : {}) })
			.where(eq(users.id, existing.id))
			.returning({ id: users.id, email: users.email, role: users.role });
		console.log(`✔ updated ${updated.email} → role=${updated.role}`);
		return;
	}

	const tenantId = await defaultTenantId();
	const [created] = await db
		.insert(users)
		.values({
			email: normalizedEmail,
			name: name ?? null,
			role,
			tenantId,
			// emailVerified bleibt null — beim ersten Magic-Link-Login wird's gesetzt.
		})
		.returning({ id: users.id, email: users.email, role: users.role });
	console.log(`✔ created ${created.email} (id=${created.id}) → role=${created.role}`);
	console.log(
		"  Hinweis: User muss sich noch über /login per Magic Link einloggen, um den Account zu aktivieren.",
	);
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.then(() => process.exit(0));
