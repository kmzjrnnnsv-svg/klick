import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { getCompanyDetail, listCompanyTeam } from "@/app/actions/admin";
import { auth } from "@/auth";
import { CompanyMemberRemove } from "@/components/admin/company-member-remove";
import { CompanyOwnerForm } from "@/components/admin/company-owner-form";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { db } from "@/db";
import { users } from "@/db/schema";

const ROLE_TONES: Record<string, string> = {
	owner: "bg-primary/15 text-primary",
	recruiter: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
	viewer: "bg-muted text-muted-foreground",
};

export default async function AdminCompanyOwnerPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const session = await auth();
	if (!session?.user?.id) redirect("/login");
	const [me] = await db
		.select({ role: users.role })
		.from(users)
		.where(eq(users.id, session.user.id))
		.limit(1);
	if (me?.role !== "admin") redirect("/post-login");

	const { id } = await params;
	const t = await getTranslations("AdminCompanyOwner");
	const fmt = await getFormatter();
	const detail = await getCompanyDetail(id);
	if (!detail) notFound();
	const team = await listCompanyTeam(id);

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-3xl flex-1 px-3 pt-6 pb-20 sm:px-6 sm:pt-12">
				<Link
					href={`/admin/companies/${id}`}
					className="text-muted-foreground text-xs hover:text-foreground"
				>
					← {detail.employer.companyName}
				</Link>
				<header className="mt-1 mb-6 border-border border-b pb-6">
					<h1 className="font-semibold text-xl tracking-tight sm:text-3xl">
						{t("title")}
					</h1>
					<p className="mt-1.5 text-muted-foreground text-sm leading-snug">
						{t("subtitle")}
					</p>
				</header>

				<section className="mb-8 rounded-lg border border-primary/30 bg-primary/5 p-4 sm:p-6">
					<h2 className="mb-3 font-medium text-sm">{t("setOwnerHeading")}</h2>
					<CompanyOwnerForm employerId={id} />
				</section>

				<section className="mb-8">
					<h2 className="mb-3 font-medium text-sm">{t("teamHeading")}</h2>
					{team.length === 0 ? (
						<p className="rounded-sm border border-border border-dashed p-6 text-center text-muted-foreground text-sm">
							{t("noTeam")}
						</p>
					) : (
						<div className="overflow-x-auto rounded-sm border border-border bg-background">
							<table className="w-full text-xs">
								<thead className="bg-muted/40 text-muted-foreground">
									<tr className="text-left">
										<th className="px-3 py-2 font-medium">{t("col.email")}</th>
										<th className="px-3 py-2 font-medium">{t("col.role")}</th>
										<th className="px-3 py-2 font-medium">
											{t("col.invitedAt")}
										</th>
										<th className="px-3 py-2 font-medium">
											{t("col.joinedAt")}
										</th>
										<th className="px-3 py-2 font-medium text-right">
											{t("col.actions")}
										</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-border">
									{team.map((m) => (
										<tr key={m.memberId} className="hover:bg-muted/20">
											<td className="px-3 py-2 font-mono text-[11px]">
												{m.email}
												{m.name ? (
													<span className="ml-1 text-muted-foreground">
														({m.name})
													</span>
												) : null}
											</td>
											<td className="px-3 py-2">
												<span
													className={`rounded-sm px-2 py-0.5 font-mono text-[10px] uppercase ${
														ROLE_TONES[m.role] ?? ""
													}`}
												>
													{t(`role.${m.role}`)}
												</span>
											</td>
											<td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
												{fmt.dateTime(m.invitedAt, { dateStyle: "short" })}
											</td>
											<td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
												{m.joinedAt
													? fmt.dateTime(m.joinedAt, { dateStyle: "short" })
													: t("pending")}
											</td>
											<td className="px-3 py-2 text-right">
												{m.role !== "owner" ? (
													<CompanyMemberRemove memberId={m.memberId} />
												) : (
													<span className="font-mono text-[10px] text-muted-foreground">
														—
													</span>
												)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</section>
			</main>
			<Footer />
		</>
	);
}
