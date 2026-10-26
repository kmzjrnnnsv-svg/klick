"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { saveNetworkPolicy } from "@/app/actions/network";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { errorText, isFourEyesNotice } from "@/components/ui/error-text";
import { FormAlert } from "@/components/ui/form-alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ListGroup, ListRow, ListSection } from "@/components/ui/list";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { ipInRanges, parseCidr, parseRanges } from "@/lib/net/ip";
import {
	locksOut,
	MAX_NETWORK_ENTRIES,
	NETWORK_EXCEPTIONS,
	type NetworkEntry,
	type NetworkPolicy,
	networkAllows,
	networkPolicyActive,
} from "@/lib/net/network-policy";

// Einstellungen > Netzwerk (Härtung A5): IP-Liste der Organisation. Leere
// Liste = aus. Externe können eine eigene Liste haben, Portale und Token
// lassen sich ausnehmen. Speichern beantragt die Änderung (Vier-Augen bzw.
// 24 h Wartezeit); die eigene Adresse muss danach noch hineinkommen.

export function NetworkPanel({
	policy,
	myIp,
	canEdit,
	pendingChange,
}: {
	policy: NetworkPolicy;
	myIp: string | null;
	canEdit: boolean;
	pendingChange: boolean;
}) {
	const t = useTranslations("NetworkSettings");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [p, setP] = useState<NetworkPolicy>(policy);
	const [error, setError] = useState<string | null>(null);
	const [pending, start] = useTransition();
	const dirty = JSON.stringify(p) !== JSON.stringify(policy);
	// Stand = gespeicherte Liste; Bearbeitung wirkt erst nach dem Antrag
	const active = networkPolicyActive(policy);
	const lockout = dirty && locksOut(p, myIp);
	const lockoutText = t(myIp ? "errorLockout" : "errorLockoutUnknown");

	const myEntry = myIp ? parseCidr(myIp)?.text : undefined;
	const hasMine = ipInRanges(
		myIp,
		parseRanges(p.members.map((e) => e.cidr)).ranges,
	);

	const save = () =>
		start(async () => {
			setError(null);
			const res = await withStepUp(() => saveNetworkPolicy(p));
			if (res.ok) {
				toast.success(t("saved"));
				router.refresh();
				return;
			}
			// Vier-Augen: beantragt bzw. wartet; kein Fehler
			// (Bearbeitung verwerfen: der Antrag steht unter Sicherheitsänderungen)
			if (isFourEyesNotice(res)) {
				toast.notice(errorText(tc, res));
				setP(policy);
				router.refresh();
				return;
			}
			if (res.error === "step_up_required") return;
			setError(
				res.error === "network_self_lockout" ? lockoutText : errorText(tc, res),
			);
		});

	return (
		<ListGroup>
			<ListSection title={t("statusTitle")} footer={t("lead")}>
				<ListRow
					title={t("statusList")}
					value={
						active ? t("statusOn", { count: p.members.length }) : t("statusOff")
					}
				/>
				<ListRow
					title={t("myIp")}
					value={
						myIp ? (
							<span className="font-mono" translate="no">
								{myIp}
							</span>
						) : (
							t("myIpUnknown")
						)
					}
				/>
				{pendingChange && (
					<ListRow
						title={t("pendingTitle")}
						subtitle={t("pendingHint")}
						href="/einstellungen?tab=sicherheitsaenderungen"
						accessory={<Badge variant="warning">{t("pendingBadge")}</Badge>}
					/>
				)}
			</ListSection>

			<EntryList
				title={t("membersTitle")}
				footer={t("membersFooter")}
				entries={p.members}
				canEdit={canEdit && !pending}
				onChange={(members) => setP({ ...p, members })}
				extra={
					canEdit && myEntry && !hasMine ? (
						<Button
							size="sm"
							variant="secondary"
							disabled={pending}
							onClick={() =>
								setP({
									...p,
									members: [
										...p.members,
										{ cidr: myEntry, note: t("myIpNote") },
									],
								})
							}
						>
							{t("addMine")}
						</Button>
					) : null
				}
			/>

			<ListSection title={t("externalsTitle")} footer={t("externalsFooter")}>
				<ListRow
					title={t("externalsOwn")}
					accessory={
						<Switch
							aria-label={t("externalsOwn")}
							checked={p.externals !== null}
							disabled={!canEdit || pending}
							onCheckedChange={(on) =>
								setP({ ...p, externals: on ? [] : null })
							}
						/>
					}
				/>
			</ListSection>
			{p.externals !== null && (
				<EntryList
					title={t("externalsListTitle")}
					footer={t("externalsListFooter")}
					entries={p.externals}
					canEdit={canEdit && !pending}
					onChange={(externals) => setP({ ...p, externals })}
				/>
			)}

			<ListSection title={t("exceptionsTitle")} footer={t("exceptionsFooter")}>
				{NETWORK_EXCEPTIONS.map((k) => (
					<ListRow
						key={k}
						title={t(`exception_${k}`)}
						subtitle={t(`exceptionHint_${k}`)}
						accessory={
							<Switch
								aria-label={t(`exception_${k}`)}
								checked={p.exceptions[k]}
								disabled={!canEdit || pending}
								onCheckedChange={(on) =>
									setP({ ...p, exceptions: { ...p.exceptions, [k]: on } })
								}
							/>
						}
					/>
				))}
			</ListSection>

			<Probe policy={p} />

			{canEdit && (
				<div className="flex flex-col gap-3">
					<FormAlert message={error ?? (lockout ? lockoutText : null)} />
					<p className="text-footnote text-muted-foreground">{t("saveHint")}</p>
					<div className="flex justify-end">
						<Button disabled={pending || !dirty || lockout} onClick={save}>
							{pending ? t("saving") : t("save")}
						</Button>
					</div>
				</div>
			)}
		</ListGroup>
	);
}

function EntryList({
	title,
	footer,
	entries,
	canEdit,
	onChange,
	extra,
}: {
	title: string;
	footer: string;
	entries: NetworkEntry[];
	canEdit: boolean;
	onChange: (next: NetworkEntry[]) => void;
	extra?: React.ReactNode;
}) {
	const t = useTranslations("NetworkSettings");
	const id = useId();
	const [cidr, setCidr] = useState("");
	const [note, setNote] = useState("");
	const [invalid, setInvalid] = useState(false);
	const full = entries.length >= MAX_NETWORK_ENTRIES;

	const add = () => {
		const parsed = parseCidr(cidr);
		if (!parsed) return setInvalid(true);
		setInvalid(false);
		if (!entries.some((e) => e.cidr === parsed.text))
			onChange([...entries, { cidr: parsed.text, note: note.trim() }]);
		setCidr("");
		setNote("");
	};

	return (
		<ListSection title={title} footer={footer}>
			{entries.length === 0 && <ListRow subtitle={t("empty")} />}
			{entries.map((e) => (
				<ListRow
					key={e.cidr}
					title={
						<span className="font-mono" translate="no">
							{e.cidr}
						</span>
					}
					subtitle={e.note || undefined}
					accessory={
						canEdit ? (
							<Button
								size="icon-sm"
								variant="ghost"
								aria-label={t("remove", { cidr: e.cidr })}
								onClick={() =>
									onChange(entries.filter((x) => x.cidr !== e.cidr))
								}
							>
								<Trash2 aria-hidden="true" />
							</Button>
						) : undefined
					}
				/>
			))}
			{canEdit && !full && (
				<ListRow>
					<form
						className="flex flex-col gap-3 py-1"
						onSubmit={(ev) => {
							ev.preventDefault();
							add();
						}}
					>
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
							<div className="flex flex-col gap-1.5">
								<Label htmlFor={`${id}-cidr`}>{t("cidrLabel")}</Label>
								<Input
									id={`${id}-cidr`}
									name="cidr"
									value={cidr}
									autoComplete="off"
									spellCheck={false}
									inputMode="url"
									placeholder={t("cidrPlaceholder")}
									aria-invalid={invalid || undefined}
									aria-describedby={invalid ? `${id}-err` : undefined}
									onChange={(ev) => {
										setCidr(ev.target.value);
										setInvalid(false);
									}}
								/>
								{invalid && (
									<p
										id={`${id}-err`}
										role="alert"
										className="text-destructive text-footnote"
									>
										{t("cidrInvalid")}
									</p>
								)}
							</div>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor={`${id}-note`}>{t("noteLabel")}</Label>
								<Input
									id={`${id}-note`}
									name="note"
									value={note}
									maxLength={120}
									autoComplete="off"
									placeholder={t("notePlaceholder")}
									onChange={(ev) => setNote(ev.target.value)}
								/>
							</div>
						</div>
						<div className="flex flex-wrap gap-2">
							<Button
								type="submit"
								size="sm"
								variant="secondary"
								disabled={!cidr.trim()}
							>
								<Plus aria-hidden="true" />
								{t("add")}
							</Button>
							{extra}
						</div>
					</form>
				</ListRow>
			)}
		</ListSection>
	);
}

// Probe: was die Liste mit dieser Adresse erlaubt, rein im Browser
function Probe({ policy }: { policy: NetworkPolicy }) {
	const t = useTranslations("NetworkSettings");
	const id = useId();
	const [ip, setIp] = useState("");
	const value = ip.trim();
	const readable = value
		? parseCidr(value) !== null && !value.includes("/")
		: false;

	return (
		<ListSection title={t("probeTitle")} footer={t("probeFooter")}>
			<ListRow>
				<div className="flex flex-col gap-1.5 py-1">
					<Label htmlFor={`${id}-ip`}>{t("probeLabel")}</Label>
					<Input
						id={`${id}-ip`}
						name="probe"
						value={ip}
						autoComplete="off"
						spellCheck={false}
						inputMode="url"
						placeholder={t("probePlaceholder")}
						onChange={(e) => setIp(e.target.value)}
					/>
					{value && !readable && (
						<p className="text-footnote text-muted-foreground">
							{t("probeInvalid")}
						</p>
					)}
				</div>
			</ListRow>
			{readable && (
				<>
					<ProbeRow
						label={t("probeMembers")}
						allowed={networkAllows(policy, "app", value)}
					/>
					<ProbeRow
						label={t("probeExternals")}
						allowed={networkAllows(policy, "app", value, { external: true })}
					/>
					{NETWORK_EXCEPTIONS.map((s) => (
						<ProbeRow
							key={s}
							label={t(`exception_${s}`)}
							allowed={networkAllows(policy, s, value)}
						/>
					))}
				</>
			)}
		</ListSection>
	);
}

function ProbeRow({ label, allowed }: { label: string; allowed: boolean }) {
	const t = useTranslations("NetworkSettings");
	return (
		<ListRow
			title={label}
			accessory={
				<Badge variant={allowed ? "success" : "destructive"}>
					{allowed ? t("probeAllowed") : t("probeDenied")}
				</Badge>
			}
		/>
	);
}
