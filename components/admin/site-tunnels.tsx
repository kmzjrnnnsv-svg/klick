"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	createSiteTunnelAction,
	ensureAdminStepUp,
	issueSiteLinkAdmin,
	previewSiteTunnel,
	removeSiteTunnelAction,
} from "@/app/actions/admin-site-tunnels";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { ExportLink } from "@/components/entity/export-link";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-alert";
import { CopyValue } from "@/components/ui/copy-value";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { errorText } from "@/components/ui/error-text";
import { FormAlert } from "@/components/ui/form-alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import type { PlanResult } from "@/lib/db/site-tunnels";
import { checkPeerIp, type SiteTech } from "@/lib/site-tunnels/rules";
import {
	SITE_VENDORS,
	type SiteVendor,
	VENDOR_GUIDES,
} from "@/lib/site-tunnels/vendors";

// Admin > Organisationen > [Org] > Standort verbinden (ADR-033): vier
// Schritte, so wenig Eingaben wie möglich. Klick schlägt die Technik nach
// der Firewall vor, prüft Netze gegen alle Standorte und vergibt bei
// Überschneidung ein Übergabenetz. Danach Link und Blatt für die IT.

const SITE_ERRORS = new Set([
	"peer_invalid",
	"peer_private",
	"peer_taken",
	"peer_is_server",
	"net_invalid",
	"net_not_private",
	"net_too_large",
	"net_duplicate",
	"net_count",
	"net_conflict",
	"too_many_tunnels",
	"site_not_configured",
	"wireguard_unavailable",
	"tunnel_in_policy",
]);

function useSiteError() {
	const t = useTranslations("AdminSites");
	const tc = useTranslations("Common");
	return (res: { error: string }) =>
		SITE_ERRORS.has(res.error)
			? t(`err_${res.error}` as "err_peer_invalid")
			: errorText(tc, res);
}

const sheetHref = (orgId: string, id: string) =>
	`/api/admin/standort-blatt.pdf?org=${orgId}&id=${id}`;

export function SiteTunnelWizard({
	orgId,
	wireguard,
	enabled,
}: {
	orgId: string;
	wireguard: boolean;
	enabled: boolean;
}) {
	const t = useTranslations("AdminSites");
	const router = useRouter();
	const siteError = useSiteError();
	const [open, setOpen] = useState(false);
	const [step, setStep] = useState(1);
	const [name, setName] = useState("");
	const [vendor, setVendor] = useState<SiteVendor | null>(null);
	const [tech, setTech] = useState<SiteTech>("ipsec");
	const [peerIp, setPeerIp] = useState("");
	const [netsText, setNetsText] = useState("");
	const [plan, setPlan] = useState<PlanResult | null>(null);
	const [created, setCreated] = useState<{
		id: string;
		transferNet: string | null;
	} | null>(null);
	const [link, setLink] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [pending, start] = useTransition();

	const nets = netsText
		.split(/[\n,;]+/)
		.map((s) => s.trim())
		.filter(Boolean);
	const peer = peerIp.trim() ? checkPeerIp(peerIp) : null;
	const guide = vendor ? VENDOR_GUIDES[vendor] : null;
	const techs = (guide?.supports ?? []).filter(
		(x) => x === "ipsec" || wireguard,
	);

	const reset = () => {
		setStep(1);
		setName("");
		setVendor(null);
		setTech("ipsec");
		setPeerIp("");
		setNetsText("");
		setPlan(null);
		setCreated(null);
		setLink(null);
		setError(null);
	};

	const pickVendor = (v: SiteVendor) => {
		setVendor(v);
		const g = VENDOR_GUIDES[v];
		setTech(g.tech === "wireguard" && !wireguard ? "ipsec" : g.tech);
	};

	const check = () =>
		start(async () => {
			setError(null);
			const res = await previewSiteTunnel({
				orgId,
				tech,
				peerIp,
				customerNets: nets,
			});
			if (!res.ok) return setError(siteError(res));
			setPlan(res.data);
			if (!res.data.ok) setError(siteError(res.data));
		});

	const create = () =>
		start(async () => {
			setError(null);
			if (!vendor) return;
			const res = await withStepUp(() =>
				createSiteTunnelAction({
					orgId,
					name,
					vendor,
					tech,
					peerIp,
					customerNets: nets,
				}),
			);
			if (!res.ok) {
				if (res.error !== "step_up_required") setError(siteError(res));
				return;
			}
			setCreated(res.data);
			setStep(5);
			router.refresh();
		});

	const makeLink = () =>
		start(async () => {
			if (!created) return;
			const res = await withStepUp(() =>
				issueSiteLinkAdmin({ orgId, id: created.id }),
			);
			if (!res.ok) {
				if (res.error !== "step_up_required") toast.error(siteError(res));
				return;
			}
			setLink(res.data.url);
		});

	const canNext =
		(step === 1 && name.trim().length >= 2 && vendor && techs.includes(tech)) ||
		(step === 2 && peer?.ok) ||
		(step === 3 && plan?.ok);

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				// beim Öffnen immer bei Schritt 1 („Fertig“ schließt ohne Reset)
				if (o) reset();
				setOpen(o);
			}}
		>
			<DialogTrigger asChild>
				<Button disabled={!enabled}>{t("connect")}</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>
						{step <= 4 ? t("wizardTitle") : t("doneTitle")}
					</DialogTitle>
					<DialogDescription>
						{step <= 4 ? t("stepOf", { step, of: 4 }) : t("doneLead", { name })}
					</DialogDescription>
				</DialogHeader>

				{step === 1 && (
					<div className="flex flex-col gap-4">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="site-name">{t("name")}</Label>
							<Input
								id="site-name"
								value={name}
								maxLength={80}
								autoComplete="off"
								placeholder={t("namePlaceholder")}
								onChange={(e) => setName(e.target.value)}
							/>
						</div>
						<fieldset className="flex flex-col gap-2">
							<legend className="mb-1 font-medium text-subhead">
								{t("vendor")}
							</legend>
							<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
								{SITE_VENDORS.map((v) => (
									<Button
										key={v}
										type="button"
										variant={vendor === v ? "default" : "secondary"}
										role="radio"
										aria-checked={vendor === v}
										className="justify-start"
										onClick={() => pickVendor(v)}
									>
										{VENDOR_GUIDES[v].label}
									</Button>
								))}
							</div>
						</fieldset>
						{guide && (
							<fieldset className="flex flex-col gap-2">
								<legend className="mb-1 font-medium text-subhead">
									{t("tech")}
								</legend>
								<div className="flex flex-wrap gap-2" role="radiogroup">
									{guide.supports.map((x) => (
										<Button
											key={x}
											type="button"
											size="sm"
											role="radio"
											aria-checked={tech === x}
											disabled={x === "wireguard" && !wireguard}
											variant={tech === x ? "default" : "secondary"}
											onClick={() => setTech(x)}
										>
											{t(`tech_${x}`)}
											{guide.tech === x ? ` · ${t("suggested")}` : ""}
										</Button>
									))}
								</div>
								<p className="text-footnote text-muted-foreground">
									{guide.note ?? t(`techHint_${tech}`)}
								</p>
								{!wireguard && guide.supports.includes("wireguard") && (
									<p className="text-footnote text-muted-foreground">
										{t("wireguardMissing")}
									</p>
								)}
							</fieldset>
						)}
					</div>
				)}

				{step === 2 && (
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="site-peer">{t("peerIp")}</Label>
						<Input
							id="site-peer"
							value={peerIp}
							inputMode="decimal"
							autoComplete="off"
							spellCheck={false}
							placeholder={t("peerPlaceholder")}
							aria-invalid={peer ? !peer.ok : undefined}
							onChange={(e) => setPeerIp(e.target.value)}
						/>
						<p className="text-footnote text-muted-foreground">
							{peer && !peer.ok ? t(`err_${peer.error}`) : t("peerHint")}
						</p>
					</div>
				)}

				{step === 3 && (
					<div className="flex flex-col gap-3">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="site-nets">{t("nets")}</Label>
							<Textarea
								id="site-nets"
								rows={3}
								value={netsText}
								spellCheck={false}
								placeholder={t("netsPlaceholder")}
								onChange={(e) => {
									setNetsText(e.target.value);
									setPlan(null);
								}}
							/>
							<p className="text-footnote text-muted-foreground">
								{t("netsHint")}
							</p>
						</div>
						<div>
							<Button
								type="button"
								variant="secondary"
								disabled={pending || nets.length === 0}
								onClick={check}
							>
								{pending ? t("checking") : t("check")}
							</Button>
						</div>
						{plan?.ok && (
							<div
								role="status"
								className="flex flex-col gap-1 rounded-xl bg-muted/50 p-3"
							>
								<p className="flex items-center gap-2 font-medium">
									<Check aria-hidden="true" className="size-4" />
									{plan.transferNet ? t("planTransfer") : t("planOk")}
								</p>
								{plan.transferNet && (
									<p className="text-subhead text-muted-foreground">
										{t("planTransferText", {
											net: plan.nets.join(", "),
											transfer: plan.transferNet,
										})}
									</p>
								)}
							</div>
						)}
					</div>
				)}

				{step === 4 && plan?.ok && guide && (
					<dl className="grid grid-cols-1 gap-x-4 gap-y-2 rounded-xl bg-muted/50 p-3 text-subhead sm:grid-cols-[auto_1fr]">
						<dt className="text-muted-foreground">{t("name")}</dt>
						<dd>{name}</dd>
						<dt className="text-muted-foreground">{t("vendor")}</dt>
						<dd>
							{guide.label}, {t(`tech_${tech}`)}
						</dd>
						<dt className="text-muted-foreground">{t("peerIp")}</dt>
						<dd className="font-mono">{plan.peerIp}</dd>
						<dt className="text-muted-foreground">{t("nets")}</dt>
						<dd className="font-mono">{plan.nets.join(", ")}</dd>
						{plan.transferNet && (
							<>
								<dt className="text-muted-foreground">{t("transfer")}</dt>
								<dd className="font-mono">{plan.transferNet}</dd>
							</>
						)}
					</dl>
				)}

				{step === 5 && created && (
					<div className="flex flex-col gap-3">
						<p className="text-subhead">{t("doneText")}</p>
						{link ? (
							<CopyValue label={t("linkLabel")} value={link} />
						) : (
							<div>
								<Button type="button" disabled={pending} onClick={makeLink}>
									{t("makeLink")}
								</Button>
							</div>
						)}
						<ExportLink
							href={sheetHref(orgId, created.id)}
							ensure={ensureAdminStepUp}
							className="text-subhead underline"
						>
							{t("sheet")}
						</ExportLink>
					</div>
				)}

				<FormAlert message={error} />
				<DialogFooter>
					{step <= 4 ? (
						<>
							<Button
								type="button"
								variant="ghost"
								onClick={() =>
									step === 1 ? setOpen(false) : setStep(step - 1)
								}
							>
								{step === 1 ? t("cancel") : t("back")}
							</Button>
							{step < 4 ? (
								<Button
									type="button"
									disabled={!canNext}
									onClick={() => {
										setError(null);
										setStep(step + 1);
									}}
								>
									{t("next")}
								</Button>
							) : (
								<Button type="button" disabled={pending} onClick={create}>
									{pending ? t("creating") : t("create")}
								</Button>
							)}
						</>
					) : (
						<Button type="button" onClick={() => setOpen(false)}>
							{t("close")}
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function SiteTunnelActions({
	orgId,
	id,
	name,
}: {
	orgId: string;
	id: string;
	name: string;
}) {
	const t = useTranslations("AdminSites");
	const router = useRouter();
	const siteError = useSiteError();
	const [link, setLink] = useState<string | null>(null);
	const [pending, start] = useTransition();
	const confirm = useConfirm({
		title: t("removeTitle", { name }),
		description: t("removeDescription"),
		confirmLabel: t("remove"),
		destructive: true,
	});
	return (
		<div className="flex flex-wrap items-center gap-2">
			<Dialog onOpenChange={(o) => !o && setLink(null)}>
				<DialogTrigger asChild>
					<Button size="sm" variant="secondary">
						{t("linkButton")}
					</Button>
				</DialogTrigger>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t("linkTitle")}</DialogTitle>
						<DialogDescription>{t("linkLead")}</DialogDescription>
					</DialogHeader>
					{link ? (
						<CopyValue label={t("linkLabel")} value={link} />
					) : (
						<div>
							<Button
								type="button"
								disabled={pending}
								onClick={() =>
									start(async () => {
										const res = await withStepUp(() =>
											issueSiteLinkAdmin({ orgId, id }),
										);
										if (res.ok) setLink(res.data.url);
										else if (res.error !== "step_up_required")
											toast.error(siteError(res));
									})
								}
							>
								{t("makeLink")}
							</Button>
						</div>
					)}
				</DialogContent>
			</Dialog>
			<ExportLink
				href={sheetHref(orgId, id)}
				ensure={ensureAdminStepUp}
				className="inline-flex h-(--control-h-sm) items-center px-2 text-subhead underline"
			>
				{t("sheetShort")}
			</ExportLink>
			<Button
				size="sm"
				variant="ghost"
				className="text-destructive"
				disabled={pending}
				onClick={() =>
					confirm.ask(() =>
						start(async () => {
							const res = await withStepUp(() =>
								removeSiteTunnelAction({ orgId, id }),
							);
							if (!res.ok) {
								if (res.error !== "step_up_required")
									toast.error(siteError(res));
								return;
							}
							toast.success(t("removed"));
							router.refresh();
						}),
					)
				}
			>
				{t("remove")}
			</Button>
			{confirm.node}
		</div>
	);
}
