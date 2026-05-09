import { eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { listAllUsers } from "@/app/actions/admin";
import { auth } from "@/auth";
import { UserRoleSelect } from "@/components/admin/user-role-select";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/db";
import { users } from "@/db/schema";
import { cn } from "@/lib/utils";

const ROLE_TONES: Record<string, string> = {
	candidate: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
	employer: "bg-primary/10 text-primary",
	admin: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

export default async function AdminUsersPage({
	searchParams,
}: {
	searchParams: Promise<{
		role?: string;
		q?: string;
	}>;
}) {
	const session = await auth();
	if (!session?.user?.id) redirect("/login");

	const [me] = await db
		.select({ role: users.role })
		.from(users)
		.where(eq(users.id, session.user.id))
		.limit(1);
	if (me?.role !== "admin") redirect("/post-login");

	const t = await getTranslations("AdminUsers");
	const fmt = await getFormatter();
	const params = await searchParams;
	const role =
		params.role === "candidate" ||
		params.role === "employer" ||
		params.role === "admin"
			? params.role
			: undefined;

	const list = await listAllUsers({ role, q: params.q, limit: 200 });

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-5xl flex-1 px-3 pt-6 pb-20 sm:px-6 sm:pt-12">
				<header className="mb-5 flex items-end justify-between gap-3">
					<div>
						<Link
							href="/admin"
							className="text-muted-foreground text-xs hover:text-foreground"
						>
							← {t("backToAdmin")}
						</Link>
						<h1 className="mt-1 font-semibold text-xl tracking-tight sm:text-3xl">
							{t("title")}
						</h1>
						<p className="mt-1.5 text-muted-foreground text-sm leading-snug">
							{t("subtitle")}
						</p>
					</div>
					<Link
						href="/admin/users/new"
						className={cn(buttonVariants({ size: "sm" }))}
					>
						{t("newUser")}
					</Link>
				</header>

				<form className="mb-4 flex flex-wrap gap-2" action="/admin/users">
					<input
						type="search"
						name="q"
						defaultValue={params.q ?? ""}
						placeholder={t("searchPlaceholder")}
						className="flex-1 rounded-sm border border-border bg-background px-3 py-2 text-sm focus-visible:border-foreground focus-visible:outline-none"
					/>
					<select
						name="role"
						defaultValue={role ?? ""}
						className="rounded-sm border border-border bg-background px-3 py-2 text-xs"
					>
						<option value="">{t("filterAllRoles")}</option>
						<option value="candidate">{t("role.candidate")}</option>
						<option value="employer">{t("role.employer")}</option>
						<option value="admin">{t("role.admin")}</option>
					</select>
					<button
						type="submit"
						className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
					>
						{t("filterApply")}
					</button>
				</form>

				{list.length === 0 ? (
					<p className="rounded-sm border border-border border-dashed p-8 text-center text-muted-foreground text-sm">
						{t("empty")}
					</p>
				) : (
					<div className="overflow-x-auto rounded-sm border border-border bg-background">
						<table className="w-full text-xs">
							<thead className="bg-muted/40 text-muted-foreground">
								<tr className="text-left">
									<th className="px-3 py-2 font-medium">{t("col.email")}</th>
									<th className="px-3 py-2 font-medium">{t("col.name")}</th>
									<th className="px-3 py-2 font-medium">{t("col.role")}</th>
									<th className="px-3 py-2 font-medium">{t("col.tenant")}</th>
									<th className="px-3 py-2 font-medium">{t("col.locale")}</th>
									<th className="px-3 py-2 font-medium">{t("col.created")}</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border">
								{list.map((u) => (
									<tr key={u.id} className="hover:bg-muted/20">
										<td className="px-3 py-2 font-mono text-[11px]">
											{u.email}
										</td>
										<td className="px-3 py-2">{u.name ?? "—"}</td>
										<td className="px-3 py-2">
											<div className="flex items-center gap-2">
												<span
													className={`rounded-sm px-2 py-0.5 font-mono text-[10px] uppercase ${
														ROLE_TONES[u.role] ?? ""
													}`}
												>
													{t(`role.${u.role}`)}
												</span>
												{u.id !== session.user?.id && (
													<UserRoleSelect userId={u.id} currentRole={u.role} />
												)}
											</div>
										</td>
										<td className="px-3 py-2 font-mono text-[11px]">
											{u.tenantSlug ?? "—"}
										</td>
										<td className="px-3 py-2">{u.locale}</td>
										<td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
											{fmt.dateTime(u.createdAt, { dateStyle: "short" })}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
				<p className="mt-3 text-muted-foreground text-xs">
					{t("footnote", { count: list.length })}
				</p>
			</main>
			<Footer />
		</>
	);
}
