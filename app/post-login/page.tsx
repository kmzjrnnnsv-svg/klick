import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { candidateProfiles, employers } from "@/db/schema";

export default async function PostLogin({
	searchParams,
}: {
	searchParams: Promise<{ skip?: string }>;
}) {
	const session = await auth();
	if (!session?.user) redirect("/login");
	const { skip } = await searchParams;

	const role = (session.user as { role?: "candidate" | "employer" | "admin" })
		.role;

	if (role === "admin") redirect("/admin");

	// Employer / headhunter: into the wizard if no employer record yet.
	// Existing employers go straight to /jobs.
	if (role === "employer") {
		if (skip === "1" || !session.user.id) redirect("/jobs");
		const [employer] = await db
			.select({ id: employers.id })
			.from(employers)
			.where(eq(employers.userId, session.user.id))
			.limit(1);
		if (!employer) redirect("/onboarding/employer");
		redirect("/jobs");
	}

	// Candidate: send to onboarding if they haven't finished it (and didn't
	// explicitly opt out via ?skip=1).
	if (skip !== "1" && session.user.id) {
		const [profile] = await db
			.select({
				onboardingCompletedAt: candidateProfiles.onboardingCompletedAt,
			})
			.from(candidateProfiles)
			.where(eq(candidateProfiles.userId, session.user.id))
			.limit(1);
		if (!profile?.onboardingCompletedAt) {
			redirect("/onboarding");
		}
	}

	redirect("/vault");
}
