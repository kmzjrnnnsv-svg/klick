"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
	createProduct,
	startProductChecklist,
	updateProduct,
	uploadSbom,
} from "@/app/actions/products";
import {
	DlpWarning,
	useUploadFeedback,
} from "@/components/entity/upload-feedback";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
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
import { Textarea } from "@/components/ui/textarea";
import {
	CRA_CLASSES,
	type CraClass,
	PRODUCT_KINDS,
	PRODUCT_ROLES,
	type ProductKind,
	type ProductRole,
} from "@/db/schema/enums";
import type { Product } from "@/db/schema/products";

// Produktregister (CRA): anlegen, einstufen, Lebenszyklus, Konformität, SBOM.
// Formulare schreiben über updateProduct; abgeleitete Werte (Verfahren,
// Checkliste) rechnet die Seite.

export function NewProductDialog() {
	const t = useTranslations("Products");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [name, setName] = useState("");
	const [kind, setKind] = useState<ProductKind>("software");
	const [role, setRole] = useState<ProductRole>("manufacturer");
	const [version, setVersion] = useState("");
	const [description, setDescription] = useState("");
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm">
					<Plus />
					{t("new")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						start(async () => {
							const res = await createProduct({
								name,
								kind,
								role,
								version,
								description: description || undefined,
							});
							if (!res.ok) return void toast.error(tc("error"));
							toast.success(t("created"));
							setOpen(false);
							router.push(`/produkte/${res.data.id}`);
						});
					}}
				>
					<DialogHeader>
						<DialogTitle>{t("new")}</DialogTitle>
						<DialogDescription>{t("newLead")}</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="prd-name">{t("name")}</Label>
						<Input
							id="prd-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							required
							maxLength={200}
							autoComplete="off"
						/>
					</div>
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="prd-kind">{t("kind")}</Label>
							<Select
								value={kind}
								onValueChange={(v) => setKind(v as ProductKind)}
							>
								<SelectTrigger id="prd-kind" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{PRODUCT_KINDS.map((k) => (
										<SelectItem key={k} value={k}>
											{t(`kind_${k}`)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="prd-role">{t("role")}</Label>
							<Select
								value={role}
								onValueChange={(v) => setRole(v as ProductRole)}
							>
								<SelectTrigger id="prd-role" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{PRODUCT_ROLES.map((r) => (
										<SelectItem key={r} value={r}>
											{t(`role_${r}`)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
					{kind === "saas" && (
						<p className="rounded-2xl bg-card p-2 text-muted-foreground text-footnote">
							{t("saasHint")}
						</p>
					)}
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="prd-version">
							{t("version")} ({tc("optional")})
						</Label>
						<Input
							id="prd-version"
							value={version}
							onChange={(e) => setVersion(e.target.value)}
							maxLength={60}
							autoComplete="off"
							spellCheck={false}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="prd-desc">
							{t("description")} ({tc("optional")})
						</Label>
						<Textarea
							id="prd-desc"
							rows={3}
							value={description}
							onChange={(e) => setDescription(e.target.value)}
						/>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setOpen(false)}
						>
							{tc("cancel")}
						</Button>
						<Button type="submit" disabled={pending || !name.trim()}>
							{pending ? `${t("create")}…` : t("create")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

type ScopeDraft = Pick<
	Product,
	| "craInScope"
	| "scopeReason"
	| "craClass"
	| "classReason"
	| "isFoss"
	| "harmonisedStandards"
	| "role"
	| "kind"
>;

function useSave(productId: string) {
	const t = useTranslations("Products");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const save = (patch: Record<string, unknown>) =>
		start(async () => {
			const res = await updateProduct({ productId, ...patch });
			if (!res.ok) return void toast.error(tc("error"));
			toast.success(t("saved"));
			router.refresh();
		});
	return { pending, save };
}

const SCOPE_VALUES = ["unknown", "yes", "no"] as const;

export function ScopeForm({
	productId,
	initial,
	disabled,
}: {
	productId: string;
	initial: ScopeDraft;
	disabled?: boolean;
}) {
	const t = useTranslations("Products");
	const tc = useTranslations("Common");
	const { pending, save } = useSave(productId);
	const [d, setD] = useState(initial);
	const set = <K extends keyof ScopeDraft>(k: K, v: ScopeDraft[K]) =>
		setD({ ...d, [k]: v });
	const scope = d.craInScope === null ? "unknown" : d.craInScope ? "yes" : "no";
	return (
		<form
			className="flex flex-col gap-4 text-subhead"
			onSubmit={(e) => {
				e.preventDefault();
				save({
					craInScope: d.craInScope,
					scopeReason: d.scopeReason ?? "",
					craClass: d.craClass,
					classReason: d.classReason ?? "",
					isFoss: d.isFoss,
					harmonisedStandards: d.harmonisedStandards,
					role: d.role,
					kind: d.kind,
				});
			}}
		>
			<fieldset className="flex flex-col gap-2" disabled={disabled}>
				<legend className="mb-1 font-medium">{t("inScope")}</legend>
				<div className="flex flex-wrap gap-4">
					{SCOPE_VALUES.map((v) => (
						<label key={v} className="flex items-center gap-2">
							<input
								type="radio"
								name="cra-scope"
								value={v}
								checked={scope === v}
								onChange={() =>
									set("craInScope", v === "unknown" ? null : v === "yes")
								}
								className="accent-primary"
							/>
							{t(`scope_${v}`)}
						</label>
					))}
				</div>
				<Label htmlFor="prd-scope-reason" className="sr-only">
					{t("scopeReason")}
				</Label>
				<Textarea
					id="prd-scope-reason"
					rows={2}
					placeholder={t("scopeReasonPlaceholder")}
					value={d.scopeReason ?? ""}
					onChange={(e) => set("scopeReason", e.target.value)}
				/>
			</fieldset>
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="prd-role-edit">{t("role")}</Label>
					<Select
						value={d.role}
						onValueChange={(v) => set("role", v as ProductRole)}
						disabled={disabled}
					>
						<SelectTrigger id="prd-role-edit" className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{PRODUCT_ROLES.map((r) => (
								<SelectItem key={r} value={r}>
									{t(`role_${r}`)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="prd-kind-edit">{t("kind")}</Label>
					<Select
						value={d.kind}
						onValueChange={(v) => set("kind", v as ProductKind)}
						disabled={disabled}
					>
						<SelectTrigger id="prd-kind-edit" className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{PRODUCT_KINDS.map((k) => (
								<SelectItem key={k} value={k}>
									{t(`kind_${k}`)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>
			{d.craInScope !== false && (
				<>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="prd-class">{t("craClass")}</Label>
						<Select
							value={d.craClass}
							onValueChange={(v) => set("craClass", v as CraClass)}
							disabled={disabled}
						>
							<SelectTrigger id="prd-class" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{CRA_CLASSES.map((c) => (
									<SelectItem key={c} value={c}>
										{t(`class_${c}`)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<p className="text-muted-foreground text-footnote">
							{t("classHint")}
						</p>
					</div>
					{d.craClass !== "default" && (
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="prd-class-reason">{t("classReason")}</Label>
							<Textarea
								id="prd-class-reason"
								rows={2}
								value={d.classReason ?? ""}
								onChange={(e) => set("classReason", e.target.value)}
								disabled={disabled}
							/>
						</div>
					)}
					<div className="flex flex-wrap gap-6">
						<label className="flex items-center gap-2">
							<Checkbox
								checked={d.isFoss}
								onCheckedChange={(v) => set("isFoss", Boolean(v))}
								disabled={disabled}
							/>
							{t("isFoss")}
						</label>
						<label className="flex items-center gap-2">
							<Checkbox
								checked={d.harmonisedStandards}
								onCheckedChange={(v) => set("harmonisedStandards", Boolean(v))}
								disabled={disabled}
							/>
							{t("harmonisedStandards")}
						</label>
					</div>
				</>
			)}
			{!disabled && (
				<div className="flex justify-end">
					<Button type="submit" size="sm" disabled={pending}>
						{pending ? `${tc("save")}…` : tc("save")}
					</Button>
				</div>
			)}
		</form>
	);
}

type LifecycleDraft = Pick<
	Product,
	| "version"
	| "placedOnMarketAt"
	| "supportUntil"
	| "supportReason"
	| "vulnContact"
>;

export function LifecycleForm({
	productId,
	initial,
	disabled,
}: {
	productId: string;
	initial: LifecycleDraft;
	disabled?: boolean;
}) {
	const t = useTranslations("Products");
	const tc = useTranslations("Common");
	const { pending, save } = useSave(productId);
	const [d, setD] = useState(initial);
	const set = <K extends keyof LifecycleDraft>(k: K, v: LifecycleDraft[K]) =>
		setD({ ...d, [k]: v });
	return (
		<form
			className="flex flex-col gap-4 text-subhead"
			onSubmit={(e) => {
				e.preventDefault();
				save({
					version: d.version ?? "",
					placedOnMarketAt: d.placedOnMarketAt || null,
					supportUntil: d.supportUntil || null,
					supportReason: d.supportReason ?? "",
					vulnContact: d.vulnContact ?? "",
				});
			}}
		>
			<fieldset
				className="grid grid-cols-1 gap-3 sm:grid-cols-3"
				disabled={disabled}
			>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="prd-ver">{t("version")}</Label>
					<Input
						id="prd-ver"
						value={d.version ?? ""}
						onChange={(e) => set("version", e.target.value)}
						autoComplete="off"
						spellCheck={false}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="prd-market">{t("placedOnMarketAt")}</Label>
					<Input
						id="prd-market"
						type="date"
						value={d.placedOnMarketAt ?? ""}
						onChange={(e) => set("placedOnMarketAt", e.target.value || null)}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="prd-support">{t("supportUntil")}</Label>
					<Input
						id="prd-support"
						type="date"
						value={d.supportUntil ?? ""}
						onChange={(e) => set("supportUntil", e.target.value || null)}
					/>
				</div>
			</fieldset>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="prd-support-reason">{t("supportReason")}</Label>
				<Textarea
					id="prd-support-reason"
					rows={2}
					placeholder={t("supportReasonPlaceholder")}
					value={d.supportReason ?? ""}
					onChange={(e) => set("supportReason", e.target.value)}
					disabled={disabled}
				/>
			</div>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="prd-contact">{t("vulnContact")}</Label>
				<Input
					id="prd-contact"
					value={d.vulnContact ?? ""}
					placeholder="https://example.com/.well-known/security.txt"
					onChange={(e) => set("vulnContact", e.target.value)}
					disabled={disabled}
					autoComplete="off"
					spellCheck={false}
				/>
				<p className="text-muted-foreground text-footnote">
					{t("vulnContactHint")}
				</p>
			</div>
			{!disabled && (
				<div className="flex justify-end">
					<Button type="submit" size="sm" disabled={pending}>
						{pending ? `${tc("save")}…` : tc("save")}
					</Button>
				</div>
			)}
		</form>
	);
}

type ConformityDraft = Pick<
	Product,
	| "riskDocumentId"
	| "techDocDocumentId"
	| "declarationAt"
	| "ceMarked"
	| "notifiedBody"
>;

export function ConformityForm({
	productId,
	initial,
	documents,
	thirdParty,
	disabled,
}: {
	productId: string;
	initial: ConformityDraft;
	documents: { id: string; docNumber: string; title: string }[];
	thirdParty: boolean;
	disabled?: boolean;
}) {
	const t = useTranslations("Products");
	const tc = useTranslations("Common");
	const { pending, save } = useSave(productId);
	const [d, setD] = useState(initial);
	const set = <K extends keyof ConformityDraft>(k: K, v: ConformityDraft[K]) =>
		setD({ ...d, [k]: v });
	const docSelect = (
		id: string,
		label: string,
		key: "riskDocumentId" | "techDocDocumentId",
	) => (
		<div className="flex flex-col gap-1.5">
			<Label htmlFor={id}>{label}</Label>
			<Select
				value={d[key] ?? "none"}
				onValueChange={(v) => set(key, v === "none" ? null : v)}
				disabled={disabled}
			>
				<SelectTrigger id={id} className="w-full">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="none">—</SelectItem>
					{documents.map((doc) => (
						<SelectItem key={doc.id} value={doc.id}>
							{doc.docNumber} {doc.title}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
	return (
		<form
			className="flex flex-col gap-4 text-subhead"
			onSubmit={(e) => {
				e.preventDefault();
				save({
					riskDocumentId: d.riskDocumentId,
					techDocDocumentId: d.techDocDocumentId,
					declarationAt: d.declarationAt || null,
					ceMarked: d.ceMarked,
					notifiedBody: d.notifiedBody ?? "",
				});
			}}
		>
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
				{docSelect("prd-risk-doc", t("riskDocument"), "riskDocumentId")}
				{docSelect("prd-tech-doc", t("techDocument"), "techDocDocumentId")}
			</div>
			{documents.length === 0 && (
				<p className="text-muted-foreground text-footnote">
					{t("noDocuments")}
				</p>
			)}
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="prd-doc-at">{t("declarationAt")}</Label>
					<Input
						id="prd-doc-at"
						type="date"
						value={d.declarationAt ?? ""}
						onChange={(e) => set("declarationAt", e.target.value || null)}
						disabled={disabled}
					/>
				</div>
				{thirdParty && (
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="prd-nb">{t("notifiedBody")}</Label>
						<Input
							id="prd-nb"
							value={d.notifiedBody ?? ""}
							onChange={(e) => set("notifiedBody", e.target.value)}
							disabled={disabled}
							autoComplete="off"
						/>
					</div>
				)}
			</div>
			<label className="flex items-center gap-2">
				<Checkbox
					checked={d.ceMarked}
					onCheckedChange={(v) => set("ceMarked", Boolean(v))}
					disabled={disabled}
				/>
				{t("ceMarked")}
			</label>
			{!disabled && (
				<div className="flex justify-end">
					<Button type="submit" size="sm" disabled={pending}>
						{pending ? `${tc("save")}…` : tc("save")}
					</Button>
				</div>
			)}
		</form>
	);
}

const SBOM_ERRORS = new Set([
	"sbom_invalid_json",
	"sbom_unknown_format",
	"sbom_unsupported_version",
]);

export function SbomUpload({ productId }: { productId: string }) {
	const t = useTranslations("Products");
	const router = useRouter();
	const { errorText, dlpWarning, tooLarge } = useUploadFeedback();
	const input = useRef<HTMLInputElement>(null);
	const [pending, start] = useTransition();
	const [warn, setWarn] = useState<string[] | null>(null);
	const [ack, setAck] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	function send(acknowledged: boolean) {
		const file = input.current?.files?.[0];
		if (!file) return;
		const big = tooLarge(file);
		if (big) return void setMessage(big);
		start(async () => {
			const fd = new FormData();
			fd.set("productId", productId);
			fd.set("file", file);
			if (acknowledged) fd.set("dlpAcknowledged", "1");
			const res = await uploadSbom(fd);
			if (!res.ok) {
				const w = dlpWarning(res);
				if (w) return void setWarn(w);
				const text = SBOM_ERRORS.has(res.error)
					? t(res.error as "sbom_invalid_json")
					: errorText(res);
				setMessage(text);
				return void toast.error(text);
			}
			setWarn(null);
			setAck(false);
			setMessage(null);
			toast.success(res.data.ok ? t("sbomOk") : t("sbomIssues"));
			if (input.current) input.current.value = "";
			router.refresh();
		});
	}
	return (
		<form
			className="flex flex-col gap-3 text-subhead"
			onSubmit={(e) => {
				e.preventDefault();
				send(ack);
			}}
		>
			<Label htmlFor="sbom-file">{t("sbomUpload")}</Label>
			<Input
				id="sbom-file"
				ref={input}
				type="file"
				accept=".json,application/json"
				required
			/>
			<p className="text-muted-foreground text-footnote">
				{t("sbomUploadHint")}
			</p>
			{warn && (
				<DlpWarning reasons={warn} acknowledged={ack} onAcknowledge={setAck} />
			)}
			<p aria-live="polite" className="text-destructive text-footnote">
				{message}
			</p>
			<div className="flex justify-end">
				<Button
					type="submit"
					size="sm"
					disabled={pending || (warn !== null && !ack)}
				>
					{pending ? `${t("sbomCheck")}…` : t("sbomCheck")}
				</Button>
			</div>
		</form>
	);
}

export function StartChecklistButton({
	productId,
	label,
}: {
	productId: string;
	label: string;
}) {
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	return (
		<Button
			size="sm"
			disabled={pending}
			onClick={() =>
				start(async () => {
					const res = await startProductChecklist({ productId });
					if (!res.ok) return void toast.error(tc("error"));
					router.push(`/gap-analyse/${res.data.id}`);
				})
			}
		>
			{pending ? `${label}…` : label}
		</Button>
	);
}
