import { CopyButton } from "@wallet/components/wallet/copy-button";
import { FreezeSignerButton } from "@wallet/components/wallet/freeze-button";
import { SignerNotice } from "@wallet/components/wallet/signer-notice";
import { requireUnlockedPage } from "@wallet/lib/auth/gates";
import { toOrgCtx } from "@wallet/lib/auth/guards";
import { readOrg } from "@wallet/lib/db/with-org";
import { userNames } from "@wallet/lib/orgs/user-names";
import { signerCall } from "@wallet/lib/wallet/signer/client";
import {
	isOwnSigner,
	loadSignerAnchor,
} from "@wallet/lib/wallet/signer/context";
import { signerState } from "@wallet/lib/wallet/signer/status";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/entity/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { formatAmountDe } from "@/lib/wallet/core/amount";
import { ASSETS, type AssetCode } from "@/lib/wallet/core/assets";
import { NETWORKS, type WalletNetwork } from "@/lib/wallet/core/networks";
import type { Policy } from "@/lib/wallet/core/policy";
import { fmtDateTime, shortHash } from "@/lib/wallet/display";

export const metadata: Metadata = { title: "Sicherheit" };

// Stellen je Asset (gleich in Test- und echtem Netz)
const DECIMALS = Object.fromEntries(
	Object.values(ASSETS)
		.flat()
		.map((a) => [a.code, a.decimals]),
) as Record<AssetCode, number>;

type SignerKey = {
	credId: string;
	person: string;
	active: boolean;
	aaguid: string | null;
	enrolledAt: number;
};

const minutes = (sec: number) => Math.round(sec / 60);

// /security — Stand des Signers: eingefroren?, Journal-Kopf,
// Bundle, Richtlinie, Sicherheitsschlüssel; „Alles stoppen“ für alle im
// Bereich, Lockern und Auftauen nur am Server-Terminal
export default async function WalletSecurityPage() {
	const ctx = await requireUnlockedPage("/security");
	const t = await getTranslations("Wallet");
	const { state, hello } = await signerState(ctx.orgId);
	const status =
		state === "ready" || state === "frozen"
			? await signerCall<{ policy: Policy; keys: SignerKey[] }>(
					"status",
					{},
					{
						timeoutMs: 5000,
					},
				)
					.then((r) => r.result)
					.catch(() => null)
			: null;
	const { anchor, names } = await readOrg(toOrgCtx(ctx), async (tx) => ({
		anchor: await loadSignerAnchor(tx, ctx.orgId),
		names: await userNames(
			tx,
			(status?.keys ?? []).map((k) => k.person),
		),
	}));
	const own = isOwnSigner(state, anchor);
	if (!own)
		return (
			<>
				<PageHeader title={t("secTitle")} lead={t("secLead")} />
				<SignerNotice state={state} />
				<EmptyState title={t("secNone")} lead={t("secNoneLead")} />
			</>
		);

	const policy = status?.policy ?? null;
	const keys = status?.keys ?? [];
	const activeByPerson = new Map<string, number>();
	for (const k of keys)
		if (k.active)
			activeByPerson.set(k.person, (activeByPerson.get(k.person) ?? 0) + 1);
	const soloShort =
		policy?.mode === "solo" &&
		![...activeByPerson.values()].some((n) => n >= policy.soloMinKeys);
	const myKeys = activeByPerson.get(ctx.userId) ?? 0;
	const frozen = hello?.frozen ?? null;
	const facts: [string, React.ReactNode][] = [
		[
			t("secState"),
			<Badge
				key="s"
				variant={
					state === "ready"
						? "success"
						: state === "frozen" || state === "unreachable"
							? "destructive"
							: "muted"
				}
			>
				{t(`secState_${state}`)}
			</Badge>,
		],
		...(frozen
			? ([
					[
						t("secFrozenSince"),
						`${fmtDateTime.format(new Date(frozen.at * 1000))} · ${t(`secFrozenBy_${frozen.by}`)} · ${frozen.reason}`,
					],
				] as [string, React.ReactNode][])
			: []),
		[
			t("secJournal"),
			anchor ? (
				<code key="j" className="font-mono text-[13px]" translate="no">
					#{anchor.seq} · {shortHash(anchor.head, 12, 8)}
				</code>
			) : (
				"—"
			),
		],
		[
			t("secChecked"),
			anchor?.checkedAt ? fmtDateTime.format(anchor.checkedAt) : "—",
		],
		[
			t("secBundle"),
			anchor?.bundleHash ? (
				<code
					key="b"
					className="break-all font-mono text-[13px]"
					translate="no"
				>
					{anchor.bundleHash}
				</code>
			) : (
				t("secBundleNone")
			),
		],
		[
			t("secNetworks"),
			(hello?.networks ?? [])
				.map((n) => NETWORKS[n as WalletNetwork]?.label ?? n)
				.join(", ") || "—",
		],
		...(hello?.dev
			? ([[t("secMode"), t("secDev")]] as [string, React.ReactNode][])
			: []),
	];

	return (
		<>
			<PageHeader
				title={t("secTitle")}
				lead={t("secLead")}
				actions={state === "ready" && <FreezeSignerButton />}
			/>
			<div className="flex flex-col gap-10">
				<section aria-labelledby="sec-state" className="flex flex-col gap-4">
					<h2
						id="sec-state"
						className="font-serif-display text-lg text-primary"
					>
						{t("secSignerTitle")}
					</h2>
					<dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-[12rem_minmax(0,1fr)]">
						{facts.map(([k, v]) => (
							<div key={k} className="contents">
								<dt className="text-muted-foreground">{k}</dt>
								<dd className="min-w-0">{v}</dd>
							</div>
						))}
					</dl>
					{state === "frozen" && (
						<p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
							{t("secUnfreezeHint")}{" "}
							<code className="font-mono text-[13px]" translate="no">
								sudo klick-signer-admin unfreeze
							</code>
						</p>
					)}
				</section>

				<section aria-labelledby="sec-keys" className="flex flex-col gap-4">
					<h2 id="sec-keys" className="font-serif-display text-lg text-primary">
						{t("secKeysTitle")}
					</h2>
					<p className="max-w-2xl text-muted-foreground text-sm">
						{t("secKeysLead")}
					</p>
					{soloShort && policy && (
						<p
							role="status"
							className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
						>
							{t("secSoloShort", { n: policy.soloMinKeys })}
						</p>
					)}
					{keys.length === 0 ? (
						<p className="text-muted-foreground text-sm">{t("secKeysNone")}</p>
					) : (
						<ul className="flex flex-col divide-y rounded-md border text-sm">
							{keys.map((k) => (
								<li
									key={k.credId}
									className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
								>
									<span className="min-w-0 grow">
										{names.get(k.person) ?? t("secUnknownPerson")}
										<code
											className="ms-2 font-mono text-muted-foreground text-xs"
											translate="no"
										>
											{shortHash(k.credId, 8, 4)}
										</code>
									</span>
									<span className="whitespace-nowrap text-muted-foreground">
										{fmtDateTime.format(new Date(k.enrolledAt * 1000))}
									</span>
									<Badge variant={k.active ? "success" : "muted"}>
										{k.active ? t("secKeyActive") : t("secKeyRevoked")}
									</Badge>
								</li>
							))}
						</ul>
					)}
					<div className="flex flex-col gap-2 rounded-md border bg-muted/40 px-3 py-3 text-sm">
						<p>
							{myKeys > 0 ? t("secMyKeys", { n: myKeys }) : t("secMyKeysNone")}{" "}
							{t("secEnrolHint")}
						</p>
						<div className="flex flex-wrap items-center gap-2">
							<code className="break-all font-mono text-[13px]" translate="no">
								sudo klick-signer-admin enrol.start --person {ctx.userId}
							</code>
							<CopyButton
								value={`sudo klick-signer-admin enrol.start --person ${ctx.userId}`}
								label={t("secCopyCommand")}
							/>
						</div>
					</div>
				</section>

				{policy && (
					<section aria-labelledby="sec-policy" className="flex flex-col gap-4">
						<h2
							id="sec-policy"
							className="font-serif-display text-lg text-primary"
						>
							{t("secPolicyTitle", { v: policy.version })}
						</h2>
						<p className="max-w-2xl text-muted-foreground text-sm">
							{t("secPolicyLead")}
						</p>
						<dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-[12rem_minmax(0,1fr)]">
							<div className="contents">
								<dt className="text-muted-foreground">{t("secApproval")}</dt>
								<dd>
									{policy.mode === "solo"
										? t("secSolo", {
												keys: policy.soloMinKeys,
												min: minutes(policy.soloDelaySec),
											})
										: t("secFourEyes")}
								</dd>
							</div>
							<div className="contents">
								<dt className="text-muted-foreground">{t("secCooldown")}</dt>
								<dd>
									{t("secHours", {
										h: Math.round(policy.whitelistCooldownSec / 3600),
									})}
								</dd>
							</div>
							<div className="contents">
								<dt className="text-muted-foreground">{t("secWindow")}</dt>
								<dd>
									{t("secMinutes", { m: minutes(policy.approvalWindowSec) })}
								</dd>
							</div>
							<div className="contents">
								<dt className="text-muted-foreground">{t("secFeeCaps")}</dt>
								<dd>
									{t("secFeeCapsValue", {
										btc: policy.feeCaps.btcSatPerVb,
										eth: policy.feeCaps.ethMaxFeeGwei,
									})}
								</dd>
							</div>
						</dl>
						<div className="overflow-x-auto rounded-md border">
							<table className="w-full text-sm">
								<caption className="sr-only">{t("secLimits")}</caption>
								<thead className="bg-muted/40 text-left text-muted-foreground">
									<tr>
										<th scope="col" className="px-4 py-2 font-medium">
											{t("secAsset")}
										</th>
										<th
											scope="col"
											className="px-4 py-2 text-right font-medium"
										>
											{t("secPerPayout")}
										</th>
										<th
											scope="col"
											className="px-4 py-2 text-right font-medium"
										>
											{t("secPerDay")}
										</th>
									</tr>
								</thead>
								<tbody className="divide-y">
									{(Object.keys(DECIMALS) as AssetCode[])
										.filter((a) => policy.limits[a])
										.map((a) => {
											const l = policy.limits[a];
											return (
												<tr key={a}>
													<th
														scope="row"
														className="px-4 py-2 text-left font-medium"
													>
														{a}
													</th>
													<td className="whitespace-nowrap px-4 py-2 text-right font-mono tabular-nums">
														{formatAmountDe(
															BigInt(l?.perPayout ?? "0"),
															DECIMALS[a],
														)}
													</td>
													<td className="whitespace-nowrap px-4 py-2 text-right font-mono tabular-nums">
														{formatAmountDe(
															BigInt(l?.perDay ?? "0"),
															DECIMALS[a],
														)}
													</td>
												</tr>
											);
										})}
								</tbody>
							</table>
						</div>
					</section>
				)}
			</div>
		</>
	);
}
