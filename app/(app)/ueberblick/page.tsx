import { CheckCircle2, Circle } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { listOrgMembers, listPendingInvitations } from "@/lib/auth/org";
import { readOrg } from "@/lib/db/with-org";
import { getOrgSettings, listOrgFrameworks } from "@/lib/org/queries";

const STAGE_LABEL: Record<string, string> = {
	"0_vorbereitung": "0 · Vorbereitung",
	"1_agent": "1 · Agent / Dienstleister",
	"2_casp_zag": "2 · CASP + ZAG",
	"3_emi": "3 · E-Geld-Institut",
	"4_bank": "4 · Bank",
};

export default async function OverviewPage() {
	const ctx = await requireOrg();
	const t = await getTranslations("Overview");
	const [members, invitations] = await Promise.all([
		listOrgMembers(ctx.orgId),
		listPendingInvitations(ctx.orgId),
	]);
	const { settings, fws } = await readOrg(toOrgCtx(ctx), async (tx) => ({
		settings: await getOrgSettings(tx, ctx.orgId),
		fws: await listOrgFrameworks(tx, ctx.orgId),
	}));
	const hasNis2 = fws.some((f) => f.slug === "nis2");

	const steps: {
		key: string;
		label: string;
		done: boolean;
		href: string;
		phase?: string;
	}[] = [
		{ key: "mfa", label: t("setupMfa"), done: true, href: "/einstellungen" },
		{
			key: "team",
			label: t("setupTeam"),
			done: members.length > 1 || invitations.length > 0,
			href: "/team",
		},
		...(hasNis2
			? [
					{
						key: "nis2",
						label: t("setupNis2"),
						done: settings?.nis2Status !== "unchecked",
						href: "/einstellungen",
						phase: "P4",
					},
				]
			: []),
		{
			key: "roles",
			label: t("setupRoles"),
			done: false,
			href: "/organisation",
			phase: "P3",
		},
		{
			key: "controls",
			label: t("setupControls"),
			done: false,
			href: "/controls",
			phase: "P1",
		},
		{
			key: "appetite",
			label: t("setupAppetite"),
			done: false,
			href: "/einstellungen",
			phase: "P2",
		},
		{
			key: "templates",
			label: t("setupTemplates"),
			done: false,
			href: "/dokumente",
			phase: "P2",
		},
		{
			key: "providers",
			label: t("setupProviders"),
			done: false,
			href: "/dienstleister",
			phase: "P2",
		},
	];
	const open = steps.filter((s) => !s.done);

	return (
		<>
			<PageHeader title={t("title")} />
			<div className="grid gap-4 lg:grid-cols-3">
				<Card className="lg:col-span-2">
					<CardHeader>
						<CardTitle>{t("setupTitle")}</CardTitle>
						<CardDescription>{t("setupLead")}</CardDescription>
					</CardHeader>
					<CardContent>
						<ul className="flex flex-col divide-y divide-border/60">
							{steps.map((s) => (
								<li
									key={s.key}
									className="flex items-center gap-3 py-2.5 text-sm"
								>
									{s.done ? (
										<CheckCircle2
											className="size-4 text-success"
											strokeWidth={1.5}
										/>
									) : (
										<Circle
											className="size-4 text-muted-foreground"
											strokeWidth={1.5}
										/>
									)}
									{s.phase && !s.done ? (
										<span className="text-muted-foreground">{s.label}</span>
									) : (
										<Link
											href={s.href}
											className={
												s.done
													? "text-muted-foreground line-through"
													: "hover:underline"
											}
										>
											{s.label}
										</Link>
									)}
									{s.phase && !s.done && (
										<span className="ml-auto text-[0.58rem] tracking-[0.12em] text-muted-foreground">
											{s.phase}
										</span>
									)}
								</li>
							))}
						</ul>
						<p className="mt-4 text-muted-foreground text-xs">
							{steps.length - open.length} {t("done")} · {open.length}{" "}
							{t("open")}
						</p>
					</CardContent>
				</Card>
				<div className="flex flex-col gap-4">
					<Card>
						<CardHeader>
							<CardTitle className="text-base">{t("frameworks")}</CardTitle>
						</CardHeader>
						<CardContent className="flex flex-wrap gap-2">
							{fws.map((f) => (
								<Badge key={f.slug} variant="outline">
									{f.name}
								</Badge>
							))}
						</CardContent>
					</Card>
					<Card>
						<CardHeader>
							<CardTitle className="text-base">{t("stage")}</CardTitle>
						</CardHeader>
						<CardContent className="text-sm">
							{STAGE_LABEL[settings?.licenceStage ?? "0_vorbereitung"]}
						</CardContent>
					</Card>
					<Card>
						<CardHeader>
							<CardTitle className="text-base">{t("members")}</CardTitle>
						</CardHeader>
						<CardContent className="text-sm">{members.length}</CardContent>
					</Card>
				</div>
			</div>
			<Card className="mt-4">
				<CardHeader>
					<CardTitle>{t("coverageTitle")}</CardTitle>
					<CardDescription>{t("coveragePending")}</CardDescription>
				</CardHeader>
			</Card>
		</>
	);
}
