import { eq } from "drizzle-orm";
import { db } from "./index";
import { tenants } from "./schema";

async function main() {
	const slug = process.env.DEFAULT_TENANT_SLUG ?? "default";

	const [existing] = await db
		.select()
		.from(tenants)
		.where(eq(tenants.slug, slug))
		.limit(1);

	if (existing) {
		console.log(`✔ tenant '${slug}' exists (id=${existing.id})`);
		return;
	}

	const [created] = await db
		.insert(tenants)
		.values({ slug, name: "Default Workspace" })
		.returning();
	console.log(`✔ created default tenant '${slug}' (id=${created.id})`);
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.then(() => process.exit(0));
