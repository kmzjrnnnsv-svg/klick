"use client";

import { saveAccessPolicy } from "@wallet/app/actions/access";
import { withStepUp } from "@wallet/components/auth/step-up-dialog";
import type { AccessPolicyInput } from "@wallet/lib/validation/access";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormAlert } from "@/components/ui/form-alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ListGroup, ListRow, ListSection } from "@/components/ui/list";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { ipInRanges, parseCidr, parseRanges } from "@/lib/net/ip";

// Einstellungen > Zugang (Härtung W): IP-Liste, nur Sicherheitsschlüssel,
// erlaubte Assets. Speichern mit Step-up; der Server prüft den Aussperr-
// Schutz noch einmal (eigene Adresse, eigene Schlüssel).

const ASSETS = ["BTC", "ETH", "USDC", "EURC"] as const;
type Asset = (typeof ASSETS)[number];

const ERRORS = [
	"lockout",
	"security_key_self",
	"security_key_required",
] as const;
type ErrorCode = (typeof ERRORS)[number];
const isError = (e: unknown): e is ErrorCode => ERRORS.includes(e as ErrorCode);

export function AccessPanel({
	policy,
	myIp,
	selfDeviceBound,
	withoutKey,
}: {
	policy: AccessPolicyInput;
	myIp: string | null;
	selfDeviceBound: boolean;
	// Mitglieder, die nur synchronisierte Passkeys haben
	withoutKey: string[];
}) {
	const t = useTranslations("Access");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [p, setP] = useState<AccessPolicyInput>(policy);
	const [cidr, setCidr] = useState("");
	const [note, setNote] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const ids = { cidr: useId(), note: useId() };

	const ranges = parseRanges(p.network.map((e) => e.cidr)).ranges;
	const mineCovered = !myIp || ipInRanges(myIp, ranges);
	const cidrValid = cidr.trim() === "" || parseCidr(cidr) !== null;
	const assets = p.allowedAssets;

	function addEntry(value: string, n: string) {
		const r = parseCidr(value);
		if (!r) return;
		if (p.network.some((e) => parseCidr(e.cidr)?.text === r.text)) return;
		setP({ ...p, network: [...p.network, { cidr: r.text, note: n.trim() }] });
	}

	async function save() {
		setBusy(true);
		setError(null);
		try {
			const res = await withStepUp(() => saveAccessPolicy(p));
			if (res.ok) {
				toast.success(
					res.data.changes.length > 0 ? t("saved") : t("unchanged"),
				);
				router.refresh();
				return;
			}
			if (res.error === "step_up_required") return;
			const ref = "ref" in res && typeof res.ref === "string" ? res.ref : null;
			setError(
				isError(res.error)
					? t(`error_${res.error}`)
					: res.error.includes(" ")
						? res.error
						: ref
							? tc("errorRef", { ref })
							: tc("error"),
			);
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="flex max-w-2xl flex-col gap-6">
			<ListGroup>
				<ListSection title={t("networkTitle")} footer={t("networkFooter")}>
					{p.network.length === 0 && (
						<ListRow title={t("networkOff")} subtitle={t("networkOffHint")} />
					)}
					{p.network.map((e) => (
						<ListRow
							key={e.cidr}
							title={
								<span className="font-mono" translate="no">
									{e.cidr}
								</span>
							}
							subtitle={e.note || undefined}
							accessory={
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={() =>
										setP({
											...p,
											network: p.network.filter((x) => x.cidr !== e.cidr),
										})
									}
								>
									{t("remove")}
								</Button>
							}
						/>
					))}
					<ListRow>
						<form
							className="flex flex-col gap-3 py-1"
							onSubmit={(ev) => {
								ev.preventDefault();
								addEntry(cidr, note);
								setCidr("");
								setNote("");
							}}
						>
							<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
								<div className="grid gap-1.5">
									<Label htmlFor={ids.cidr}>{t("cidr")}</Label>
									<Input
										id={ids.cidr}
										name="cidr"
										value={cidr}
										onChange={(ev) => setCidr(ev.target.value)}
										placeholder={t("cidrPlaceholder")}
										autoComplete="off"
										spellCheck={false}
										aria-invalid={!cidrValid}
										className="font-mono"
									/>
								</div>
								<div className="grid gap-1.5">
									<Label htmlFor={ids.note}>{t("note")}</Label>
									<Input
										id={ids.note}
										name="note"
										value={note}
										onChange={(ev) => setNote(ev.target.value)}
										placeholder={t("notePlaceholder")}
										autoComplete="off"
										maxLength={120}
									/>
								</div>
							</div>
							{!cidrValid && (
								<p className="text-destructive text-footnote" role="alert">
									{t("cidrInvalid")}
								</p>
							)}
							<div className="flex flex-wrap gap-2">
								<Button
									type="submit"
									variant="secondary"
									size="sm"
									disabled={!cidr.trim() || !cidrValid}
								>
									{t("add")}
								</Button>
								{myIp && !mineCovered && (
									<Button
										type="button"
										variant="ghost"
										size="sm"
										onClick={() => addEntry(myIp, t("myIpNote"))}
									>
										{t("addMine")}
									</Button>
								)}
							</div>
						</form>
					</ListRow>
					<ListRow
						title={t("myIp")}
						value={
							<span className="font-mono" translate="no">
								{myIp ?? t("unknownIp")}
							</span>
						}
						subtitle={
							p.network.length > 0
								? mineCovered
									? t("myIpInside")
									: t("myIpOutside")
								: undefined
						}
					/>
				</ListSection>

				<ListSection title={t("keysTitle")} footer={t("keysFooter")}>
					<ListRow
						title={t("keysOnly")}
						subtitle={selfDeviceBound ? undefined : t("keysSelfMissing")}
						accessory={
							<Switch
								checked={p.securityKeysOnly}
								disabled={!selfDeviceBound && !p.securityKeysOnly}
								onCheckedChange={(v) => setP({ ...p, securityKeysOnly: v })}
								aria-label={t("keysOnly")}
							/>
						}
					/>
					{p.securityKeysOnly && withoutKey.length > 0 && (
						<ListRow
							title={t("keysAffected", { count: withoutKey.length })}
							subtitle={withoutKey.join(", ")}
						/>
					)}
				</ListSection>

				<ListSection title={t("assetsTitle")} footer={t("assetsFooter")}>
					<ListRow
						title={t("assetsAll")}
						accessory={
							<Switch
								checked={assets === null}
								onCheckedChange={(v) =>
									setP({ ...p, allowedAssets: v ? null : ["USDC", "EURC"] })
								}
								aria-label={t("assetsAll")}
							/>
						}
					/>
					{assets !== null &&
						ASSETS.map((a) => (
							<ListRow key={a}>
								<label className="flex min-h-11 cursor-pointer items-center gap-3">
									<Checkbox
										checked={assets.includes(a)}
										onCheckedChange={(v) => {
											const next: Asset[] = v
												? [...assets, a]
												: assets.filter((x) => x !== a);
											setP({ ...p, allowedAssets: next });
										}}
									/>
									<span>{t(`asset_${a}`)}</span>
								</label>
							</ListRow>
						))}
					{assets !== null && assets.length === 0 && (
						<ListRow subtitle={t("assetsNone")} />
					)}
				</ListSection>
			</ListGroup>

			<FormAlert message={error} />
			<div>
				<Button
					type="button"
					onClick={save}
					disabled={busy || (assets !== null && assets.length === 0)}
				>
					{busy ? t("saving") : t("save")}
				</Button>
			</div>
		</div>
	);
}
