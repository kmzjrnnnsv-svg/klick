import { headers } from "next/headers";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AcceptInvitation } from "@/components/auth/accept-invitation";
import { buttonVariants } from "@/components/ui/button";
import { getSessionCtx } from "@/lib/auth/guards";
import { auth } from "@/lib/auth/server";

const ROLE_LABEL: Record<string, string> = {
	owner: "Inhaber:in",
	editor: "Bearbeiter:in",
	viewer: "Lesend",
	auditor: "Prüfer:in",
};

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
					className={buttonVariants({ variant: "brown" })}
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
			<p className="lv-eyebrow text-[0.6rem] text-brown">Klick</p>
			<h1 className="font-serif-display text-3xl text-primary">{t("title")}</h1>
			<p className="text-muted-foreground">
				{t("lead", {
					inviter: invitation.inviterEmail,
					organization: invitation.organizationName,
					role: ROLE_LABEL[invitation.role ?? ""] ?? invitation.role ?? "",
				})}
			</p>
			<AcceptInvitation invitationId={id} />
		</div>
	);
}
