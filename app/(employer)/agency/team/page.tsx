import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { getOwnerCount, listAgents } from "@/app/actions/agency";
import { auth } from "@/auth";
import { InviteAgentForm } from "@/components/agency/invite-agent-form";
import { MemberRoleActions } from "@/components/agency/member-role-actions";
import { RemoveAgentButton } from "@/components/agency/remove-agent-button";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";

const ROLE_TONES: Record<string, string> = {
	owner: "bg-primary text-primary-foreground",
	recruiter: "bg-muted text-foreground",
	viewer: "bg-muted/60 text-muted-foreground",
};

export default async function AgencyTeamPage() {
	const session = await auth();
	if (!session?.user) redirect("/login");

	const t = await getTranslations("Agency");
	const fmt = await getFormatter();
	const { owner, members } = await listAgents();
	const ownerInfo = await getOwnerCount();

	// Aktuell eingeloggter User: ist er Owner? Owner sehen die Invite-Form,
	// Recruiter/Viewer nicht. Wir checken serverseitig — Cap-Schutz greift
	// in der Action ohnehin nochmal.
	const myUserId = session.user.id ?? null;
	const isOwner =
		owner.userId === myUserId ||
		members.some(
			(m) => m.userId === myUserId && m.role === "owner" && m.joinedAt,
		);

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

				<section className="mb-6 rounded-md border border-primary/30 bg-primary/5 p-4">
					<div className="flex flex-wrap items-baseline justify-between gap-3">
						<p className="font-medium text-sm">
							{t("ownerCount", {
								count: ownerInfo.count,
								max: ownerInfo.max,
							})}
						</p>
						<p className="text-muted-foreground text-xs leading-relaxed">
							{t("ownerCountHint")}
						</p>
					</div>
				</section>

				{isOwner ? (
					<section className="mb-10 rounded-sm border border-border bg-background p-4 sm:p-6">
						<p className="lv-eyebrow text-[0.55rem] text-primary">
							{t("inviteEyebrow")}
						</p>
						<h2 className="mt-2 mb-3 font-serif-display text-xl">
							{t("inviteTitle")}
						</h2>
						{ownerInfo.isFull && (
							<p className="mb-3 rounded-sm border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-800 text-xs dark:text-amber-200">
								{t("ownerCapReached", { max: ownerInfo.max })}
							</p>
						)}
						<InviteAgentForm />
					</section>
				) : (
					<section className="mb-10 rounded-sm border border-border bg-muted/30 p-4 sm:p-6">
						<p className="font-medium text-sm">{t("readOnly")}</p>
						<p className="mt-1 text-muted-foreground text-xs leading-relaxed">
							{t("readOnlyHint")}
						</p>
					</section>
				)}

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
								className="grid grid-cols-[1fr_auto_auto_auto] items-baseline gap-3 py-4"
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
								{isOwner ? (
									<MemberRoleActions
										memberId={m.id}
										role={m.role}
										canPromote={!ownerInfo.isFull}
									/>
								) : (
									<span />
								)}
								{isOwner && m.role !== "owner" ? (
									<RemoveAgentButton id={m.id} />
								) : (
									<span />
								)}
							</li>
						))}
					</ul>
				</section>
			</main>
			<Footer />
		</>
	);
}
