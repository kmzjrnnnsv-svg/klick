import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function PostLogin() {
	const session = await auth();
	if (!session?.user) redirect("/login");
	const role = (session.user as { role?: "candidate" | "employer" | "admin" })
		.role;
	if (role === "employer") redirect("/jobs");
	if (role === "admin") redirect("/admin");
	redirect("/vault");
}
