"use client";

import { createKlickLink } from "@wallet/app/actions/export";
import { Link2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { withStepUp } from "../auth/step-up-dialog";
import { useExportFeedback } from "./use-export-feedback";

export function LinkCreateDialog({
	origins,
	accounts,
	defaultFrom,
}: {
	origins: string[];
	accounts: { id: string; name: string; network: string }[];
	defaultFrom: string;
}) {
	const t = useTranslations("Export");
	const tc = useTranslations("Common");
	const router = useRouter();
	const feedback = useExportFeedback();
	const [open, setOpen] = useState(false);
	const [origin, setOrigin] = useState(origins[0] ?? "");
	const [token, setToken] = useState("");
	const [scope, setScope] = useState<"all" | "some">("all");
	const [selected, setSelected] = useState<string[]>([]);
	const [from, setFrom] = useState(defaultFrom);
	const [busy, setBusy] = useState(false);

	function reset(o: boolean) {
		setOpen(o);
		if (!o) {
			setToken("");
			setScope("all");
			setSelected([]);
			setFrom(defaultFrom);
		}
	}

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		setBusy(true);
		try {
			const res = await withStepUp(() =>
				createKlickLink({
					origin,
					token: token.trim(),
					accountIds: scope === "all" ? null : selected,
					backfillFrom: from || null,
				}),
			);
			if (!res.ok) {
				feedback(res);
				return;
			}
			feedback(
				res,
				t("connected", { org: res.data.klickOrgName, count: res.data.events }),
			);
			reset(false);
			router.refresh();
		} finally {
			setBusy(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={reset}>
			<DialogTrigger asChild>
				<Button>
					<Link2 aria-hidden /> {t("connect")}
				</Button>
			</DialogTrigger>
			<DialogContent className="max-h-[90dvh] overflow-y-auto overscroll-contain sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{t("connectTitle")}</DialogTitle>
					<DialogDescription>{t("connectLead")}</DialogDescription>
				</DialogHeader>
				<form onSubmit={submit} className="flex flex-col gap-5">
					<div className="grid gap-2">
						<Label htmlFor="export-origin">{t("origin")}</Label>
						{origins.length > 1 ? (
							<Select value={origin} onValueChange={setOrigin}>
								<SelectTrigger id="export-origin">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{origins.map((o) => (
										<SelectItem key={o} value={o}>
											<span translate="no">{o}</span>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						) : (
							<Input
								id="export-origin"
								readOnly
								value={origin}
								translate="no"
								className="font-mono text-subhead"
							/>
						)}
					</div>
					<div className="grid gap-2">
						<Label htmlFor="export-token">{t("token")}</Label>
						<Input
							id="export-token"
							name="klick-token"
							type="password"
							required
							autoComplete="off"
							spellCheck={false}
							placeholder={t("tokenPlaceholder")}
							value={token}
							onChange={(e) => setToken(e.target.value)}
							className="font-mono text-subhead"
						/>
						<p className="text-muted-foreground text-footnote">
							{t("tokenHint")}
						</p>
					</div>
					<fieldset className="grid gap-2">
						<legend className="font-medium text-footnote mb-2 text-footnote text-muted-foreground">
							{t("scope")}
						</legend>
						<label className="flex items-center gap-2 text-subhead">
							<input
								type="radio"
								name="export-scope"
								value="all"
								checked={scope === "all"}
								onChange={() => setScope("all")}
								className="size-4 accent-primary"
							/>
							{t("scopeAll")}
						</label>
						<label className="flex items-center gap-2 text-subhead">
							<input
								type="radio"
								name="export-scope"
								value="some"
								checked={scope === "some"}
								onChange={() => setScope("some")}
								disabled={accounts.length === 0}
								className="size-4 accent-primary"
							/>
							{t("scopeSome")}
						</label>
						{scope === "some" && (
							<ul className="ms-6 flex flex-col gap-2 border-s ps-3">
								{accounts.map((a) => (
									<li key={a.id}>
										<label className="flex items-center gap-2 text-subhead">
											<Checkbox
												checked={selected.includes(a.id)}
												onCheckedChange={(v) =>
													setSelected((s) =>
														v ? [...s, a.id] : s.filter((x) => x !== a.id),
													)
												}
											/>
											<span className="min-w-0 truncate">{a.name}</span>
										</label>
									</li>
								))}
							</ul>
						)}
						{accounts.length === 0 && (
							<p className="text-muted-foreground text-footnote">
								{t("scopeNone")}
							</p>
						)}
					</fieldset>
					<div className="grid gap-2">
						<Label htmlFor="export-from">{t("backfill")}</Label>
						<Input
							id="export-from"
							type="date"
							value={from}
							onChange={(e) => setFrom(e.target.value)}
							className="w-48"
						/>
						<p className="text-muted-foreground text-footnote">
							{t("backfillHint")}
						</p>
					</div>
					<div className="flex justify-end gap-2">
						<Button type="button" variant="ghost" onClick={() => reset(false)}>
							{tc("cancel")}
						</Button>
						<Button
							type="submit"
							disabled={busy || (scope === "some" && selected.length === 0)}
						>
							{busy ? t("submitting") : t("submit")}
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
