"use client";

import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addSite, completeSetupStep, deleteSite } from "@/app/actions/setup";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { SiteKind } from "@/db/schema/registers";
import { newRiskHref } from "@/lib/compliance/risk-sources";
import { useStepRunner } from "./step-footer";

const KINDS: readonly SiteKind[] = [
	"headquarters",
	"office",
	"datacenter",
	"warehouse",
	"branch",
	"other",
];

type Site = {
	id: string;
	name: string;
	kind: SiteKind;
	country: string | null;
	city: string | null;
	employees: number | null;
	critical: boolean;
};

// Schritt 3 (D2): Standorte direkt ins Register (sites)
export function SitesStep({
	sites,
	defaultCountry,
	nextHref,
	canEdit = true,
	canRisk = false,
}: {
	sites: Site[];
	defaultCountry: string;
	// ohne nextHref: eigenständig (Organisation → Standorte), kein „Weiter“
	nextHref?: string;
	canEdit?: boolean;
	// „Als Risiko erfassen“ je Standort (Risiko-Herkunft „Standort“)
	canRisk?: boolean;
}) {
	const t = useTranslations("Setup");
	const tr = useTranslations("RiskSources");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const { pending: moving, run } = useStepRunner(
		nextHref ?? "/organisation?tab=standorte",
	);
	const empty = {
		name: "",
		kind: (sites.length === 0 ? "headquarters" : "office") as SiteKind,
		country: defaultCountry,
		city: "",
		employees: "",
		critical: sites.length === 0,
	};
	const [d, setD] = useState(empty);

	return (
		<div className="flex flex-col gap-6">
			{sites.length === 0 ? (
				<p className="text-muted-foreground text-sm">{t("sitesEmpty")}</p>
			) : (
				<ul className="flex flex-col divide-y rounded-md border text-sm">
					{sites.map((s) => (
						<li key={s.id} className="flex items-center gap-3 px-3 py-2">
							<div className="min-w-0 flex-1">
								<p className="font-medium">
									{s.name}{" "}
									{s.critical && (
										<Badge variant="warning">{t("critical")}</Badge>
									)}
								</p>
								<p className="text-muted-foreground text-xs">
									{t(`kind_${s.kind}`)}
									{s.city ? ` · ${s.city}` : ""}
									{s.country ? ` · ${s.country}` : ""}
									{s.employees != null
										? ` · ${s.employees} ${t("siteEmployees")}`
										: ""}
								</p>
							</div>
							{canRisk && (
								<Link
									href={newRiskHref("site", s.id)}
									className="shrink-0 text-primary text-xs underline-offset-4 hover:underline"
								>
									{tr("create")}
								</Link>
							)}
							{canEdit && (
								<Button
									size="icon"
									variant="ghost"
									aria-label={`${t("remove")}: ${s.name}`}
									disabled={pending}
									onClick={() =>
										start(async () => {
											const res = await deleteSite({ id: s.id });
											if (!res.ok) return void toast.error(tc("error"));
											toast.success(t("siteDeleted"));
											router.refresh();
										})
									}
								>
									<Trash2 />
								</Button>
							)}
						</li>
					))}
				</ul>
			)}

			{canEdit && (
				<form
					className="flex flex-col gap-4 rounded-md border p-4"
					onSubmit={(e) => {
						e.preventDefault();
						start(async () => {
							const res = await addSite({
								name: d.name,
								kind: d.kind,
								country: d.country,
								city: d.city,
								employees: d.employees ? Number(d.employees) : undefined,
								critical: d.critical,
							});
							if (!res.ok) return void toast.error(tc("error"));
							toast.success(t("siteAdded"));
							setD({ ...empty, kind: "office", critical: false });
							router.refresh();
						});
					}}
				>
					<h2 className="font-medium text-sm">{t("addSite")}</h2>
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="si-name">{t("siteName")}</Label>
							<Input
								id="si-name"
								required
								autoComplete="off"
								value={d.name}
								onChange={(e) => setD({ ...d, name: e.target.value })}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="si-kind">{t("siteKind")}</Label>
							<Select
								value={d.kind}
								onValueChange={(v) => setD({ ...d, kind: v as SiteKind })}
							>
								<SelectTrigger id="si-kind" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{KINDS.map((k) => (
										<SelectItem key={k} value={k}>
											{t(`kind_${k}`)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="si-city">{t("city")}</Label>
							<Input
								id="si-city"
								autoComplete="address-level2"
								value={d.city}
								onChange={(e) => setD({ ...d, city: e.target.value })}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="si-country">{t("siteCountry")}</Label>
							<Input
								id="si-country"
								maxLength={2}
								spellCheck={false}
								value={d.country}
								onChange={(e) =>
									setD({ ...d, country: e.target.value.toUpperCase() })
								}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="si-emp">{t("siteEmployees")}</Label>
							<Input
								id="si-emp"
								inputMode="numeric"
								value={d.employees}
								onChange={(e) =>
									setD({ ...d, employees: e.target.value.replace(/\D/g, "") })
								}
							/>
						</div>
						<label className="flex items-center gap-2 self-end pb-2 text-sm">
							<Checkbox
								checked={d.critical}
								onCheckedChange={(v) => setD({ ...d, critical: Boolean(v) })}
							/>
							{t("critical")}
						</label>
					</div>
					<div>
						<Button
							size="sm"
							type="submit"
							disabled={pending || !d.name.trim()}
						>
							{t("addSite")}
						</Button>
					</div>
				</form>
			)}

			{nextHref && (
				<div className="flex justify-end">
					<Button
						variant="brown"
						disabled={moving}
						onClick={() => run(() => completeSetupStep({ step: "standorte" }))}
					>
						{t("next")}
					</Button>
				</div>
			)}
		</div>
	);
}
