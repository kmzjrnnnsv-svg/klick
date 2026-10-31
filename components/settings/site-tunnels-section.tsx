"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { issueOwnSiteLink } from "@/app/actions/site-tunnels";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { ExportLink } from "@/components/entity/export-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyValue } from "@/components/ui/copy-value";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { errorText } from "@/components/ui/error-text";
import { ListRow, ListSection } from "@/components/ui/list";
import { toast } from "@/components/ui/toast";
import type { TunnelState } from "@/lib/site-tunnels/rules";
import type { TunnelView } from "@/lib/site-tunnels/service";
import { VENDOR_GUIDES } from "@/lib/site-tunnels/vendors";

// Einstellungen > Netzwerk > Standort-Tunnel (ADR-033): Stand je Tunnel,
// neuer Link und Blatt für die IT (Inhaber:innen, Step-up). Anlegen und
// Abbauen macht der Klick-Betrieb; „Nur noch über den Standort“ steht in der
// IP-Liste darüber (Vier-Augen).

const BADGE: Record<
	TunnelState,
	"success" | "secondary" | "destructive" | "muted"
> = {
	connected: "success",
	pending: "secondary",
	down: "destructive",
	error: "destructive",
	unknown: "muted",
};

export function SiteTunnelsSection({
	tunnels,
	canEdit,
}: {
	tunnels: readonly TunnelView[];
	canEdit: boolean;
}) {
	const t = useTranslations("SiteTunnels");
	const fmt = new Intl.DateTimeFormat("de-DE", {
		dateStyle: "short",
		timeStyle: "short",
		timeZone: "Europe/Berlin",
	});
	return (
		<ListSection title={t("title")} footer={t("footer")}>
			{tunnels.length === 0 ? (
				<ListRow title={t("none")} subtitle={t("noneHint")} />
			) : (
				tunnels.map((tn) => (
					<ListRow
						key={tn.id}
						title={tn.name}
						subtitle={
							<>
								{`${VENDOR_GUIDES[tn.vendor].label} · ${t(`tech_${tn.tech}`)}`}
								<span className="block font-mono" translate="no">
									{tn.transferNet
										? t("netsNat", {
												nets: tn.customerNets.join(", "),
												transfer: tn.transferNet,
											})
										: tn.customerNets.join(", ")}
								</span>
								{tn.state === "connected" && tn.lastHandshakeAt && (
									<span className="block">
										{t("handshake", {
											date: fmt.format(new Date(tn.lastHandshakeAt)),
										})}
									</span>
								)}
								{(tn.state === "down" || tn.state === "error") && (
									<span className="block">{t(`hint_${tn.state}`)}</span>
								)}
								{canEdit && (
									<span className="mt-2 flex flex-wrap items-center gap-2">
										<LinkDialog id={tn.id} />
										<ExportLink
											href={`/api/export/standort-blatt.pdf?id=${tn.id}`}
											className="inline-flex h-(--control-h-sm) items-center px-2 text-subhead underline"
										>
											{t("sheet")}
										</ExportLink>
									</span>
								)}
							</>
						}
						accessory={
							<Badge variant={BADGE[tn.state]}>{t(`state_${tn.state}`)}</Badge>
						}
					/>
				))
			)}
		</ListSection>
	);
}

function LinkDialog({ id }: { id: string }) {
	const t = useTranslations("SiteTunnels");
	const tc = useTranslations("Common");
	const [link, setLink] = useState<string | null>(null);
	const [pending, start] = useTransition();
	return (
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
									const res = await withStepUp(() => issueOwnSiteLink(id));
									if (res.ok) setLink(res.data.url);
									else if (res.error !== "step_up_required")
										toast.error(errorText(tc, res));
								})
							}
						>
							{t("makeLink")}
						</Button>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
