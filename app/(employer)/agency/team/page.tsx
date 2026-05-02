import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { listAgents } from "@/app/actions/agency";
import { auth } from "@/auth";
import { InviteAgentForm } from "@/components/agency/invite-agent-form";
import { RemoveAgentButton } from "@/components/agency/remove-agent-button";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";

const ROLE_TONES: Record<string, string> = {
	owner: "bg-foreground text-background",
	recruiter: "bg-muted text-foreground",
	viewer: "bg-muted/60 text-muted-foreground",
};

export default async function AgencyTeamPage() {
	const session = await auth();
	if (!session?.user) redirect("/login");

	const t = await getTranslations("Agency");
	const fmt = await getFormatter();
	const { owner, members } = await listAgents();

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-3xl flex-1 px-3 pt-6 pb-20 sm:px-6 sm:pt-12">
				<header className="mb-6">
					<p className="lv-eyebrow text-[0.6rem] text-primary">
						{t("eyebrow")}
					</p>
					<h1 className="mt-2 font-serif-display text-3xl sm:text-4xl">
						{t("title")}
					</h1>
					<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
						{t("subtitle")}
					</p>
				</header>

				<section className="mb-10 rounded-sm border border-border bg-background p-4 sm:p-6">
					<p className="lv-eyebrow text-[0.55rem] text-primary">
						{t("inviteEyebrow")}
					</p>
					<h2 className="mt-2 mb-3 font-serif-display text-xl">
						{t("inviteTitle")}
					</h2>
					<InviteAgentForm />
				</section>

				<section>
					<p className="lv-eyebrow text-[0.55rem] text-muted-foreground">
						{t("teamEyebrow")}
					</p>
					<h2 className="mt-2 mb-4 font-serif-display text-xl">
						{t("teamTitle")}
					</h2>
					<ul className="divide-y divide-border border-border border-t border-b">
						<li className="grid grid-cols-[1fr_auto] items-baseline gap-3 py-4">
							<div>
								<p className="font-medium text-sm">
									{owner.name ?? owner.email}
								</p>
								{owner.email && (
									<p className="font-mono text-[10px] text-muted-foreground">
										{owner.email}
									</p>
								)}
							</div>
							<span
								className={`lv-eyebrow rounded-sm px-2 py-1 text-[0.5rem] ${ROLE_TONES.owner}`}
							>
								{t("role.owner")}
							</span>
						</li>
						{members.map((m) => (
							<li
								key={m.id}
								className="grid grid-cols-[1fr_auto_auto] items-baseline gap-3 py-4"
							>
								<div>
									<p className="font-medium text-sm">{m.inviteEmail}</p>
									<p className="font-mono text-[10px] text-muted-foreground">
										{m.joinedAt
											? t("joinedAt", {
													date: fmt.dateTime(m.joinedAt, {
														dateStyle: "short",
													}),
												})
											: t("invitedAt", {
													date: fmt.dateTime(m.invitedAt, {
														dateStyle: "short",
													}),
												})}
									</p>
								</div>
								<span
									className={`lv-eyebrow rounded-sm px-2 py-1 text-[0.5rem] ${
										ROLE_TONES[m.role] ?? ROLE_TONES.recruiter
									}`}
								>
									{t(`role.${m.role}`)}
								</span>
								<RemoveAgentButton id={m.id} />
							</li>
						))}
					</ul>
				</section>
			</main>
			<Footer />
		</>
	);
}
