// Dev-only helper: flip a user's role.
// Usage: pnpm tsx scripts/set-role.ts <email> <candidate|employer|admin>
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";

async function main() {
	const [email, role] = process.argv.slice(2);
	if (!email || !role) {
		console.error("Usage: pnpm tsx scripts/set-role.ts <email> <role>");
		process.exit(1);
	}
	if (role !== "candidate" && role !== "employer" && role !== "admin") {
		console.error(`Role must be candidate|employer|admin, got: ${role}`);
		process.exit(1);
	}
	const updated = await db
		.update(users)
		.set({ role })
		.where(eq(users.email, email))
		.returning({ id: users.id, email: users.email, role: users.role });
	if (updated.length === 0) {
		console.error(`No user with email ${email}`);
		process.exit(1);
	}
	console.log(`✔ ${updated[0].email} → role=${updated[0].role}`);
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.then(() => process.exit(0));
