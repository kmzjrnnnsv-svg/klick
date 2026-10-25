"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { planControlTest } from "@/app/actions/testprogramme";
import {
	Field,
	FormDialog,
	NewTrigger,
} from "@/components/organisation/governance-forms";
import { errorText } from "@/components/ui/error-text";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { CONTROL_TEST_METHODS } from "@/db/schema/enums";

export function PlanTestForm({
	controls,
	processes,
	sites = [],
	defaultMethod,
	defaultProcessId,
	defaultSiteId,
	triggerLabel,
}: {
	controls: { implementationId: string; code: string; title: string }[];
	processes: { id: string; code: string; name: string }[];
	// Standorte (Notfallübung je kritischem Standort)
	sites?: { id: string; name: string }[];
	defaultMethod?: (typeof CONTROL_TEST_METHODS)[number];
	defaultProcessId?: string | null;
	defaultSiteId?: string | null;
	triggerLabel?: string;
}) {
	const t = useTranslations("TestProgramme");
	const tt = useTranslations("Tests");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [impl, setImpl] = useState("");
	const [method, setMethod] = useState<(typeof CONTROL_TEST_METHODS)[number]>(
		defaultMethod ?? "inspection",
	);
	const [plannedAt, setPlannedAt] = useState("");
	const [scope, setScope] = useState("");
	const [processId, setProcessId] = useState(defaultProcessId ?? "none");
	const [siteId, setSiteId] = useState(defaultSiteId ?? "none");
	return (
		<FormDialog
			title={t("planTest")}
			lead={t("planLead")}
			trigger={<NewTrigger label={triggerLabel ?? t("planTest")} />}
			open={open}
			setOpen={setOpen}
			pending={pending}
			disabled={!impl || !plannedAt}
			onSubmit={() =>
				start(async () => {
					const res = await planControlTest({
						implementationId: impl,
						method,
						plannedAt,
						scope: scope || undefined,
						processId: processId === "none" ? null : processId,
						siteId: siteId === "none" ? null : siteId,
					});
					if (!res.ok) return void toast.error(errorText(tc, res));
					toast.success(t("planned"));
					setOpen(false);
					router.refresh();
				})
			}
		>
			<div className="flex flex-col gap-1.5">
				<Label>Control</Label>
				<Select value={impl} onValueChange={setImpl}>
					<SelectTrigger className="w-full">
						<SelectValue placeholder="—" />
					</SelectTrigger>
					<SelectContent>
						{controls.map((c) => (
							<SelectItem key={c.implementationId} value={c.implementationId}>
								{c.code} · {c.title}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<div className="flex flex-col gap-1.5">
					<Label>{t("method")}</Label>
					<Select
						value={method}
						onValueChange={(v) => setMethod(v as typeof method)}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{CONTROL_TEST_METHODS.map((m) => (
								<SelectItem key={m} value={m}>
									{tt(`method_${m}`)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<Field
					id="pt-date"
					label={t("plannedAt")}
					type="date"
					value={plannedAt}
					onChange={setPlannedAt}
					required
				/>
				{sites.length > 0 && (
					<div className="flex flex-col gap-1.5 sm:col-span-2">
						<Label htmlFor="pt-site">{t("site")}</Label>
						<Select value={siteId} onValueChange={setSiteId}>
							<SelectTrigger id="pt-site" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="none">—</SelectItem>
								{sites.map((x) => (
									<SelectItem key={x.id} value={x.id}>
										{x.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				)}
				<div className="flex flex-col gap-1.5 sm:col-span-2">
					<Label>{t("process")}</Label>
					<Select value={processId} onValueChange={setProcessId}>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="none">—</SelectItem>
							{processes.map((p) => (
								<SelectItem key={p.id} value={p.id}>
									{p.code} {p.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>
			<Field
				id="pt-scope"
				label={t("scope")}
				value={scope}
				onChange={setScope}
			/>
		</FormDialog>
	);
}
