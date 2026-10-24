import { headers } from "next/headers";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AcceptInvitation } from "@/components/auth/accept-invitation";
import { buttonVariants } from "@/components/ui/button";
import { getSessionCtx } from "@/lib/auth/guards";
import { roleLabel } from "@/lib/auth/memberships";
import { auth } from "@/lib/auth/server";

export default async function InvitationPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const t = await getTranslations("Invitation");
	const ctx = await getSessionCtx();

	if (!ctx) {
		return (
			<div className="flex flex-col gap-6">
				<h1 className="font-serif-display text-3xl text-primary">
					{t("title")}
				</h1>
				<p className="text-muted-foreground">{t("loginFirst")}</p>
				<Link
					href={`/login?weiter=/einladung/${id}`}
					className={buttonVariants()}
				>
					Anmelden
				</Link>
			</div>
		);
	}

	let invitation: Awaited<ReturnType<typeof auth.api.getInvitation>> | null =
		null;
	try {
		invitation = await auth.api.getInvitation({
			query: { id },
			headers: await headers(),
		});
	} catch {
		invitation = null;
	}

	if (
		!invitation ||
		invitation.status !== "pending" ||
		new Date(invitation.expiresAt) < new Date()
	) {
		return (
			<div className="flex flex-col gap-6">
				<h1 className="font-serif-display text-3xl text-primary">
					{t("title")}
				</h1>
				<p className="text-muted-foreground">{t("expired")}</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-6">
			<h1 className="font-serif-display text-3xl text-primary">{t("title")}</h1>
			<p className="text-muted-foreground">
				{t("lead", {
					inviter: invitation.inviterEmail,
					organization: invitation.organizationName,
					role: roleLabel(invitation.role),
				})}
			</p>
			<AcceptInvitation invitationId={id} />
		</div>
	);
}
