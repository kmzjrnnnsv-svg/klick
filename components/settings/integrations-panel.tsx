"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	createAccessToken,
	revokeAccessToken,
} from "@/app/actions/integrations";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { errorText } from "@/components/ui/error-text";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { INGEST_SCOPES, type IngestScope } from "@/db/schema/enums";
import { githubActionsSnippet } from "@/lib/security/ci-snippets";

type TokenRow = {
	id: string;
	name: string;
	prefix: string;
	scopes: string[];
	subjectId: string | null;
	expiresAt: Date;
	lastUsedAt: Date | null;
	revokedAt: Date | null;
	createdByName: string | null;
};
type ProductOption = { id: string; code: string; name: string };

const fmt = new Intl.DateTimeFormat("de-DE", {
	dateStyle: "medium",
	timeZone: "Europe/Berlin",
});

// Einstellungen → Integrationen: Tokens für den CI-Ingest (ADR-017).
export function IntegrationsPanel({
	tokens,
	products,
	baseUrl,
	canCreate,
	canRevoke,
}: {
	tokens: TokenRow[];
	products: ProductOption[];
	baseUrl: string;
	canCreate: boolean;
	canRevoke: boolean;
}) {
	const t = useTranslations("Integrations");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [name, setName] = useState("");
	const [scopes, setScopes] = useState<IngestScope[]>([
		"scan:write",
		"sbom:write",
	]);
	const [days, setDays] = useState("90");
	const [productId, setProductId] = useState("");
	const [created, setCreated] = useState<string | null>(null);
	const [revoking, setRevoking] = useState<TokenRow | null>(null);
	const now = new Date();
	const product = products.find((p) => p.id === productId);
	const snippet = githubActionsSnippet({
		baseUrl,
		productCode: product?.code ?? null,
		failOn: "critical",
	});
	return (
		<div className="flex flex-col gap-6">
			<Card>
				<CardHeader>
					<CardTitle className="text-base">{t("title")}</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-4 text-subhead">
					<p className="max-w-2xl text-muted-foreground">{t("lead")}</p>
					{tokens.length === 0 ? (
						<p className="text-muted-foreground">{t("empty")}</p>
					) : (
						<ul className="flex flex-col list-inset overflow-hidden rounded-2xl bg-card">
							{tokens.map((tok) => {
								const state = tok.revokedAt
									? "revoked"
									: tok.expiresAt <= now
										? "expired"
										: "active";
								return (
									<li
										key={tok.id}
										className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
									>
										<span className="min-w-0">
											<span className="font-medium">{tok.name}</span>{" "}
											<span
												className="font-mono text-muted-foreground text-footnote"
												translate="no"
											>
												{tok.prefix}…
											</span>
											<span className="block text-muted-foreground text-footnote">
												{tok.scopes.join(", ")} ·{" "}
												{t("expires", { date: fmt.format(tok.expiresAt) })} ·{" "}
												{tok.lastUsedAt
													? t("lastUsed", { date: fmt.format(tok.lastUsedAt) })
													: t("neverUsed")}
												{tok.createdByName ? ` · ${tok.createdByName}` : ""}
											</span>
										</span>
										<span className="flex items-center gap-2">
											<Badge variant={state === "active" ? "success" : "muted"}>
												{t(`state_${state}`)}
											</Badge>
											{state === "active" && canRevoke && (
												<Button
													size="sm"
													variant="outline"
													onClick={() => setRevoking(tok)}
												>
													{t("revoke")}
												</Button>
											)}
										</span>
									</li>
								);
							})}
						</ul>
					)}
				</CardContent>
			</Card>

			{canCreate && (
				<Card>
					<CardHeader>
						<CardTitle className="text-base">{t("newTitle")}</CardTitle>
					</CardHeader>
					<CardContent>
						<form
							className="flex max-w-xl flex-col gap-4 text-subhead"
							onSubmit={(e) => {
								e.preventDefault();
								start(async () => {
									const res = await withStepUp(() =>
										createAccessToken({
											name,
											scopes,
											expiresInDays: Number(days),
											productId: productId || null,
										}),
									);
									if (!res.ok) return void toast.error(errorText(tc, res));
									setCreated(res.data.token);
									setName("");
									router.refresh();
								});
							}}
						>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="tok-name">{t("name")}</Label>
								<Input
									id="tok-name"
									value={name}
									placeholder={t("namePlaceholder")}
									onChange={(e) => setName(e.target.value)}
									required
									maxLength={80}
									autoComplete="off"
								/>
							</div>
							<fieldset className="flex flex-col gap-2">
								<legend className="mb-1 font-medium">{t("scopes")}</legend>
								{INGEST_SCOPES.map((s) => (
									<label key={s} className="flex items-center gap-2">
										<Checkbox
											checked={scopes.includes(s)}
											onCheckedChange={(v) =>
												setScopes(
													v ? [...scopes, s] : scopes.filter((x) => x !== s),
												)
											}
										/>
										<span className="font-mono text-footnote" translate="no">
											{s}
										</span>
										<span className="text-muted-foreground">
											{t(`scope_${s.replace(":", "_") as "scan_write"}`)}
										</span>
									</label>
								))}
							</fieldset>
							<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="tok-days">{t("validity")}</Label>
									<Select value={days} onValueChange={setDays}>
										<SelectTrigger id="tok-days" className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{["30", "90", "180", "365"].map((d) => (
												<SelectItem key={d} value={d}>
													{t("days", { n: Number(d) })}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								{products.length > 0 && (
									<div className="flex flex-col gap-1.5">
										<Label htmlFor="tok-product">{t("product")}</Label>
										<Select
											value={productId || "none"}
											onValueChange={(v) => setProductId(v === "none" ? "" : v)}
										>
											<SelectTrigger id="tok-product" className="w-full">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="none">{t("anyProduct")}</SelectItem>
												{products.map((p) => (
													<SelectItem key={p.id} value={p.id}>
														{p.code} {p.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								)}
							</div>
							<div className="flex justify-end">
								<Button
									type="submit"
									disabled={pending || !name.trim() || scopes.length === 0}
								>
									{pending ? tc("creating") : t("create")}
								</Button>
							</div>
						</form>
					</CardContent>
				</Card>
			)}

			<Card>
				<CardHeader>
					<CardTitle className="text-base">{t("ciTitle")}</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-3 text-subhead">
					<p className="max-w-2xl text-muted-foreground">{t("ciLead")}</p>
					<pre
						className="max-h-96 overflow-auto rounded-xl bg-muted p-3 text-footnote"
						translate="no"
					>
						{snippet}
					</pre>
					<div>
						<Button
							size="sm"
							variant="outline"
							onClick={() =>
								navigator.clipboard
									.writeText(snippet)
									.then(() => toast.success(t("copied")))
									.catch(() => toast.error(tc("error")))
							}
						>
							{t("copySnippet")}
						</Button>
					</div>
				</CardContent>
			</Card>

			<Dialog
				open={created !== null}
				onOpenChange={(o) => !o && setCreated(null)}
			>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>{t("createdTitle")}</DialogTitle>
						<DialogDescription>{t("createdLead")}</DialogDescription>
					</DialogHeader>
					<Input
						readOnly
						value={created ?? ""}
						className="font-mono text-footnote"
						onFocus={(e) => e.currentTarget.select()}
					/>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() =>
								navigator.clipboard
									.writeText(created ?? "")
									.then(() => toast.success(t("copied")))
									.catch(() => toast.error(tc("error")))
							}
						>
							{t("copy")}
						</Button>
						<Button onClick={() => setCreated(null)}>{t("done")}</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={revoking !== null}
				onOpenChange={(o) => !o && setRevoking(null)}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>{t("revokeTitle")}</DialogTitle>
						<DialogDescription>
							{t("revokeLead", { name: revoking?.name ?? "" })}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setRevoking(null)}>
							{tc("cancel")}
						</Button>
						<Button
							variant="destructive"
							disabled={pending}
							onClick={() =>
								start(async () => {
									if (!revoking) return;
									const res = await withStepUp(() =>
										revokeAccessToken({ tokenId: revoking.id }),
									);
									if (!res.ok) return void toast.error(errorText(tc, res));
									toast.success(t("revoked"));
									setRevoking(null);
									router.refresh();
								})
							}
						>
							{pending ? tc("working") : t("revoke")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
