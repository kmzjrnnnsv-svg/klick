import { NewAccountDialog } from "@wallet/components/wallet/account-form";
import { IntroFooter, IntroWatchlist } from "@wallet/components/wallet/intro";
import { requireUnlockedPage } from "@wallet/lib/auth/gates";
import { toOrgCtx } from "@wallet/lib/auth/guards";
import { roleAllows } from "@wallet/lib/auth/permissions";
import { readOrg } from "@wallet/lib/db/with-org";
import { watchlistQuotes } from "@wallet/lib/wallet/market";
import { configuredNetworks } from "@wallet/lib/wallet/node-clients";
import { getWalletPreferences } from "@wallet/lib/wallet/preferences";
import { listWalletAccounts } from "@wallet/lib/wallet/queries";
import { stepFromSlug, welcomeHref } from "@wallet/lib/welcome";
import {
	ArrowDownToLine,
	Ban,
	Check,
	CheckCircle2,
	Clock,
	Fingerprint,
	KeyRound,
	type LucideIcon,
	Network,
	ScrollText,
	ShieldCheck,
	TrendingUp,
	Usb,
	Wallet,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PAIRS } from "@/lib/wallet/core/feeds";
import { NETWORKS, WALLET_NETWORKS } from "@/lib/wallet/core/networks";
import { FAUCETS } from "@/lib/wallet/display";
import {
	INTRO_STEPS,
	type IntroStep,
	introNeighbours,
} from "@/lib/wallet/intro";
import { PAIR_NAMES } from "@/lib/wallet/pair-names";
import { formatScaled } from "@/lib/wallet/prices";

export const metadata: Metadata = { title: "Einführung Wallet" };

const ICON: Record<IntroStep, LucideIcon> = {
	willkommen: Wallet,
	sicherheit: ShieldCheck,
	netz: Network,
	konto: KeyRound,
	kurse: TrendingUp,
	einzahlung: ArrowDownToLine,
};

function Card({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"rounded-xl border border-border/60 bg-card p-5 sm:p-6",
				className,
			)}
		>
			{children}
		</div>
	);
}

function Points({
	title,
	items,
	Icon,
	tone,
}: {
	title: string;
	items: string[];
	Icon: LucideIcon;
	tone: "good" | "soon" | "no";
}) {
	return (
		<Card>
			<h2 className="font-medium text-base">{title}</h2>
			<ul className="mt-3 flex flex-col gap-2.5 text-sm">
				{items.map((x) => (
					<li key={x} className="flex gap-2.5">
						<Icon
							aria-hidden
							className={cn(
								"mt-0.5 size-4 shrink-0",
								tone === "good" && "text-success",
								tone !== "good" && "text-muted-foreground",
							)}
						/>
						<span className={cn(tone === "no" && "text-muted-foreground")}>
							{x}
						</span>
					</li>
				))}
			</ul>
		</Card>
	);
}

// /welcome/[step] — geführte Einführung beim ersten Öffnen:
// was der Bereich kann, Sicherheit, Netz, erstes Konto, Kurse, erste
// Einzahlung. Jeder Schritt speichert beim „Weiter“, „Später“ geht immer.
export default async function WalletIntroPage({
	params,
}: {
	params: Promise<{ step: string }>;
}) {
	const schritt = stepFromSlug((await params).step);
	if (!schritt) notFound();
	const ctx = await requireUnlockedPage(welcomeHref(schritt));
	const t = await getTranslations("WalletIntro");
	const tw = await getTranslations("Wallet");
	const canManage = roleAllows(ctx.role, "wallet:manage");

	const { prefs, accounts } = await readOrg(toOrgCtx(ctx), async (tx) => ({
		prefs: await getWalletPreferences(tx, ctx.orgId, ctx.userId),
		accounts:
			schritt === "konto" || schritt === "einzahlung"
				? await listWalletAccounts(tx, ctx.orgId)
				: [],
	}));
	const idx = INTRO_STEPS.indexOf(schritt);
	const doneIdx = prefs.introStep
		? INTRO_STEPS.indexOf(prefs.introStep as IntroStep)
		: -1;
	const { prev, next } = introNeighbours(schritt);
	const prevHref = prev ? welcomeHref(prev) : null;
	const nextHref = next ? welcomeHref(next) : "/";
	const configured = configuredNetworks();
	const testNetworks = configured
		.filter((n) => !NETWORKS[n].live)
		.map((n) => ({ key: n, label: NETWORKS[n].label }));
	const Icon = ICON[schritt];

	const titles: Record<IntroStep, [string, string]> = {
		willkommen: [t("welcomeTitle"), t("welcomeLead")],
		sicherheit: [t("securityTitle"), t("securityLead")],
		netz: [t("networkTitle"), t("networkLead")],
		konto: [t("accountTitle"), t("accountLead")],
		kurse: [t("quotesTitle"), t("quotesLead")],
		einzahlung: [t("depositTitle"), t("depositLead")],
	};
	const [title, lead] = titles[schritt];

	let body: ReactNode = null;
	switch (schritt) {
		case "willkommen":
			body = (
				<div className="flex flex-col gap-3">
					<Points
						title={t("canTitle")}
						Icon={Check}
						tone="good"
						items={[t("can1"), t("can2"), t("can3"), t("can4"), t("can5")]}
					/>
					<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
						<Points
							title={t("soonTitle")}
							Icon={Clock}
							tone="soon"
							items={[t("soon1"), t("soon2"), t("soon3")]}
						/>
						<Points
							title={t("notTitle")}
							Icon={Ban}
							tone="no"
							items={[t("not1"), t("not2")]}
						/>
					</div>
				</div>
			);
			break;
		case "sicherheit":
			body = (
				<div className="flex flex-col gap-3">
					{(
						[
							[Fingerprint, t("passkeyTitle"), t("passkeyBody")],
							[Usb, t("keyTitle"), t("keyBody")],
							[ScrollText, t("seedTitle"), t("seedBody")],
						] as const
					).map(([I, h, p]) => (
						<Card key={h} className="flex gap-4">
							<span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
								<I className="size-5" aria-hidden />
							</span>
							<div className="min-w-0">
								<h2 className="font-medium">{h}</h2>
								<p className="mt-1 text-muted-foreground text-sm">{p}</p>
							</div>
						</Card>
					))}
					<p className="flex items-center gap-2 text-sm">
						<CheckCircle2 className="size-4 text-success" aria-hidden />
						{t("securityStatus")}
					</p>
					<p className="rounded-lg bg-muted/40 p-4 text-sm">
						{t("securityNote")}
					</p>
				</div>
			);
			break;
		case "netz":
			body = (
				<div className="flex flex-col gap-3">
					<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
						<Card>
							<h2 className="font-medium">{t("signetTitle")}</h2>
							<p className="mt-1 text-muted-foreground text-sm">
								{t("signetBody")}
							</p>
						</Card>
						<Card>
							<h2 className="font-medium">{t("sepoliaTitle")}</h2>
							<p className="mt-1 text-muted-foreground text-sm">
								{t("sepoliaBody")}
							</p>
						</Card>
					</div>
					<Card>
						<h2 className="font-medium">{t("liveTitle")}</h2>
						<p className="mt-1 text-muted-foreground text-sm">
							{t("liveBody")}
						</p>
					</Card>
					<section aria-labelledby="intro-nodes" className="mt-4">
						<h2 id="intro-nodes" className="mb-2 font-medium text-base">
							{t("nodesTitle")}
						</h2>
						<ul className="divide-y divide-border/60 rounded-xl border border-border/60">
							{WALLET_NETWORKS.map((n) => (
								<li
									key={n}
									className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
								>
									<span className="min-w-0 truncate">{NETWORKS[n].label}</span>
									{NETWORKS[n].live ? (
										<Badge variant="muted">{t("nodeLocked")}</Badge>
									) : configured.includes(n) ? (
										<Badge variant="success">{t("nodeReady")}</Badge>
									) : (
										<Badge variant="muted">{t("nodeMissing")}</Badge>
									)}
								</li>
							))}
						</ul>
					</section>
				</div>
			);
			break;
		case "konto":
			body = (
				<div className="flex flex-col gap-4">
					{accounts.length > 0 ? (
						<Card>
							<p className="flex items-center gap-2 font-medium">
								<CheckCircle2 className="size-4 text-success" aria-hidden />
								{t("accountsThere", { count: accounts.length })}
							</p>
							<ul className="mt-3 flex flex-col gap-1.5 text-sm">
								{accounts.slice(0, 5).map((a) => (
									<li
										key={a.id}
										className="flex items-center justify-between gap-3"
									>
										<span className="min-w-0 truncate">{a.name}</span>
										<span className="shrink-0 text-muted-foreground text-xs">
											{NETWORKS[a.network].label}
										</span>
									</li>
								))}
							</ul>
						</Card>
					) : (
						<Card>
							<h2 className="font-medium">{t("howTitle")}</h2>
							<ol className="mt-3 flex flex-col gap-3 text-sm">
								{[t("how1"), t("how2"), t("how3")].map((x, i) => (
									<li key={x} className="flex gap-3">
										<span className="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs tabular-nums">
											{i + 1}
										</span>
										<span className="pt-0.5">{x}</span>
									</li>
								))}
							</ol>
							<div className="mt-5">
								{!canManage ? (
									<p className="text-muted-foreground text-sm">
										{t("accountNotManager")}
									</p>
								) : testNetworks.length === 0 ? (
									<p className="text-muted-foreground text-sm">
										{t("noNetwork")}
									</p>
								) : (
									<NewAccountDialog networks={testNetworks} />
								)}
							</div>
						</Card>
					)}
					<p className="text-muted-foreground text-sm">{t("accountHot")}</p>
				</div>
			);
			break;
		case "kurse": {
			const quotes = await watchlistQuotes(PAIRS);
			const any = quotes.some((q) => q.price !== null);
			body = (
				<>
					{!any && (
						<p className="mb-4 rounded-lg bg-muted/40 p-4 text-sm">
							{t("quotesNone")}
						</p>
					)}
					<IntroWatchlist
						quotes={quotes.map((q) => ({
							pair: q.pair,
							name: PAIR_NAMES[q.pair],
							price:
								q.price !== null
									? `${formatScaled(q.price, q.pair.startsWith("USDC") || q.pair === "EUR/USD" ? 4 : 2)} ${q.pair.endsWith("/EUR") ? "€" : "$"}`
									: null,
							changeBp: q.changeBp,
						}))}
						selected={prefs.pairs}
						nextHref={nextHref}
						prevHref={prevHref ?? "/"}
					/>
				</>
			);
			break;
		}
		case "einzahlung": {
			const nets = [...new Set(accounts.map((a) => a.network))];
			const faucets = nets.flatMap((n) => FAUCETS[n] ?? []);
			body = (
				<div className="flex flex-col gap-4">
					<Card>
						<h2 className="font-medium">{t("flowTitle")}</h2>
						<ol className="mt-4 flex flex-col">
							{[t("flow1"), t("flow2"), t("flow3"), t("flow4"), t("flow5")].map(
								(x, i, all) => (
									<li key={x} className="relative flex gap-3 pb-4 last:pb-0">
										{i < all.length - 1 && (
											<span
												aria-hidden
												className="absolute top-6 bottom-0 left-3 w-px bg-border"
											/>
										)}
										<span className="relative flex size-6 shrink-0 items-center justify-center rounded-full border bg-card text-xs tabular-nums">
											{i + 1}
										</span>
										<span className="pt-0.5 text-sm">{x}</span>
									</li>
								),
							)}
						</ol>
					</Card>
					{accounts.length > 0 ? (
						<div className="flex flex-wrap gap-2">
							{accounts.slice(0, 4).map((a) => (
								<Button key={a.id} asChild variant="outline" size="sm">
									<Link href={`/receive?account=${a.id}`}>
										<ArrowDownToLine aria-hidden />
										{t("showAddress", { name: a.name })}
									</Link>
								</Button>
							))}
						</div>
					) : (
						<p className="text-muted-foreground text-sm">
							{t("depositNoAccount")}
						</p>
					)}
					{faucets.length > 0 && (
						<section aria-labelledby="intro-faucets">
							<h2 id="intro-faucets" className="mb-2 font-medium text-base">
								{t("faucetsTitle")}
							</h2>
							<ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
								{faucets.map((f) => (
									<li key={f.href}>
										<a
											href={f.href}
											target="_blank"
											rel="noopener noreferrer"
											className="text-primary underline-offset-4 hover:underline"
										>
											{tw(f.key)} <span aria-hidden>↗</span>
										</a>
									</li>
								))}
							</ul>
						</section>
					)}
				</div>
			);
			break;
		}
	}

	return (
		<div className="flex flex-col">
			<nav aria-label={t("progressLabel")}>
				<p className="lv-eyebrow text-[0.7rem] text-brown">
					{t("eyebrow")} ·{" "}
					{t("stepOf", { n: idx + 1, total: INTRO_STEPS.length })}
				</p>
				<ol className="mt-3 grid grid-cols-6 gap-1.5">
					{INTRO_STEPS.map((s, i) => (
						<li key={s}>
							<Link
								href={welcomeHref(s)}
								aria-current={s === schritt ? "step" : undefined}
								className="group block py-2 focus-visible:outline-2 focus-visible:outline-primary"
							>
								<span
									aria-hidden
									className={cn(
										"block h-1 rounded-full transition-[background-color]",
										s === schritt
											? "bg-brown"
											: i <= Math.max(idx, doneIdx)
												? "bg-foreground"
												: "bg-border group-hover:bg-muted-foreground/40",
									)}
								/>
								<span
									className={cn(
										"mt-1.5 hidden truncate text-[11px] sm:block",
										s === schritt
											? "font-medium text-foreground"
											: "text-muted-foreground",
									)}
								>
									{t(`step_${s}`)}
								</span>
								<span className="sr-only sm:hidden">
									{t("stepOf", { n: i + 1, total: INTRO_STEPS.length })}:{" "}
									{t(`step_${s}`)}
								</span>
							</Link>
						</li>
					))}
				</ol>
			</nav>

			<header className="mt-8 mb-8 flex flex-col gap-4">
				<span className="flex size-12 items-center justify-center rounded-full bg-brown text-brown-foreground">
					<Icon className="size-5" aria-hidden />
				</span>
				<h1 className="text-balance font-serif-display text-3xl text-primary sm:text-4xl">
					{title}
				</h1>
				<p className="max-w-prose text-pretty text-base text-muted-foreground">
					{lead}
				</p>
			</header>

			{body}

			{schritt !== "kurse" && (
				<IntroFooter
					step={schritt}
					prevHref={prevHref}
					nextHref={nextHref}
					primary={next ? "next" : "finish"}
				/>
			)}
		</div>
	);
}
