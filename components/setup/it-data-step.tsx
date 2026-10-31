"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { saveItData } from "@/app/actions/setup";
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
import type { AiClassLevel } from "@/db/schema/enums";
import type { EntityProfile } from "@/db/schema/platform";
import type { PROVIDER_CATEGORIES } from "@/db/schema/registers";
import { useStepRunner } from "./step-footer";

const IT = ["cloud", "hybrid", "own_dc"] as const;
const PERSONAL_DATA = [
	"kunden",
	"beschaeftigte",
	"bewerber",
	"lieferanten",
	"interessenten",
	"zahlungsdaten",
	"ausweisdaten",
] as const;
const SUBJECTS = ["lt1k", "1k_100k", "gt100k"] as const;
const CARD_DATA = ["none", "outsourced", "own"] as const;
const AI_USE = ["none", "use", "build"] as const;
// Ja/Nein-Fragen, aus denen Klick Rahmenwerke vorschlägt
const MORE = [
	"automotive",
	"usTransfers",
	"usFederal",
	"usHealth",
	"nyFinance",
	"awsPartner",
	"msSupplier",
] as const;
type More = (typeof MORE)[number];
type Category = (typeof PROVIDER_CATEGORIES)[number];
// Werte lokal (kein Schema-Import in den Client-Bundle)
const CATEGORIES: readonly Category[] = [
	"cloud",
	"it_service",
	"maintenance",
	"consulting",
	"facility",
	"subcontractor",
	"other",
];
type ProviderRow = {
	key: number;
	name: string;
	service: string;
	category: Category;
	critical: boolean;
};

// Schritt 5 (D3): IT-Betrieb, wichtige Dienstleister (direkt ins Register),
// personenbezogene Daten und Kundenländer
// Darf eine KI Inhalte lesen? (ADR-032) Schlüssel und Freischaltung kommen
// später unter Einstellungen > KI.
const AI_ANSWERS = ["none", "internal", "confidential"] as const;

export function ItDataStep({
	initial,
	aiMaxClass,
	existingProviders,
	nextHref,
}: {
	initial: EntityProfile;
	aiMaxClass: AiClassLevel;
	existingProviders: string[];
	nextHref: string;
}) {
	const t = useTranslations("Setup");
	const { pending, run } = useStepRunner(nextHref);
	const [it, setIt] = useState<(typeof IT)[number]>(
		initial.itOperation ?? "cloud",
	);
	const [pd, setPd] = useState<string[]>(initial.personalData ?? []);
	const [special, setSpecial] = useState(initial.specialCategories ?? false);
	const [cards, setCards] = useState<(typeof CARD_DATA)[number]>(
		initial.cardData ?? "none",
	);
	const [aiUse, setAiUse] = useState<(typeof AI_USE)[number]>(
		initial.aiUse ?? "none",
	);
	const [more, setMore] = useState<Record<More, boolean>>(
		() =>
			Object.fromEntries(MORE.map((k) => [k, initial[k] ?? false])) as Record<
				More,
				boolean
			>,
	);
	const [subjects, setSubjects] = useState<string>(
		initial.dataSubjects ?? "lt1k",
	);
	const [countries, setCountries] = useState(
		(initial.customerCountries ?? []).join(", "),
	);
	const [rows, setRows] = useState<ProviderRow[]>([
		{ key: 1, name: "", service: "", category: "cloud", critical: true },
	]);
	const known = new Set(existingProviders.map((n) => n.toLowerCase()));
	const [ai, setAi] = useState<(typeof AI_ANSWERS)[number]>(
		aiMaxClass === "confidential"
			? "confidential"
			: aiMaxClass === "none"
				? "none"
				: "internal",
	);

	return (
		<form
			className="flex flex-col gap-8"
			onSubmit={(e) => {
				e.preventDefault();
				run(
					() =>
						saveItData({
							itOperation: it,
							personalData: pd,
							specialCategories: special,
							cardData: cards,
							aiUse,
							...more,
							dataSubjects: subjects as (typeof SUBJECTS)[number],
							aiMaxClass: ai,
							customerCountries: countries
								.split(/[,\s]+/)
								.map((c) => c.trim().toUpperCase())
								.filter((c) => /^[A-Z]{2}$/.test(c)),
							providers: rows
								.filter((r) => r.name.trim())
								.map((r) => ({
									name: r.name,
									service: r.service,
									category: r.category,
									critical: r.critical,
								})),
						}),
					(res) =>
						t("providersCreated", {
							n:
								(res as { data?: { providersCreated?: number } }).data
									?.providersCreated ?? 0,
						}),
				);
			}}
		>
			<fieldset className="flex flex-col gap-2 text-subhead">
				<legend className="mb-1.5 font-medium">{t("itOperation")}</legend>
				{IT.map((x) => (
					<label key={x} className="flex items-center gap-2">
						<input
							type="radio"
							name="it"
							value={x}
							checked={it === x}
							onChange={() => setIt(x)}
							className="size-4 accent-primary"
						/>
						{t(`it_${x}`)}
					</label>
				))}
			</fieldset>

			<section className="flex flex-col gap-3">
				<div>
					<h2 className="font-medium text-subhead">{t("providersTitle")}</h2>
					<p className="text-muted-foreground text-footnote">
						{t("providersLead")}
					</p>
					{existingProviders.length > 0 && (
						<p className="mt-1 text-muted-foreground text-footnote">
							{t("providersExisting")}: {existingProviders.join(", ")}
						</p>
					)}
				</div>
				<ul className="flex flex-col gap-3">
					{rows.map((r, i) => (
						<li
							key={r.key}
							className="grid grid-cols-1 items-end gap-3 rounded-2xl bg-card p-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto_auto]"
						>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor={`pv-name-${r.key}`}>{t("providerName")}</Label>
								<Input
									id={`pv-name-${r.key}`}
									autoComplete="off"
									value={r.name}
									aria-invalid={
										known.has(r.name.trim().toLowerCase()) || undefined
									}
									onChange={(e) =>
										setRows(
											rows.map((x, j) =>
												j === i ? { ...x, name: e.target.value } : x,
											),
										)
									}
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor={`pv-svc-${r.key}`}>
									{t("providerService")}
								</Label>
								<Input
									id={`pv-svc-${r.key}`}
									autoComplete="off"
									value={r.service}
									onChange={(e) =>
										setRows(
											rows.map((x, j) =>
												j === i ? { ...x, service: e.target.value } : x,
											),
										)
									}
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor={`pv-cat-${r.key}`}>
									{t("providerCategory")}
								</Label>
								<Select
									value={r.category}
									onValueChange={(v) =>
										setRows(
											rows.map((x, j) =>
												j === i ? { ...x, category: v as Category } : x,
											),
										)
									}
								>
									<SelectTrigger id={`pv-cat-${r.key}`} className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{CATEGORIES.map((c) => (
											<SelectItem key={c} value={c}>
												{t(`cat_${c}`)}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<label className="flex items-center gap-2 pb-2 text-subhead">
								<Checkbox
									checked={r.critical}
									onCheckedChange={(v) =>
										setRows(
											rows.map((x, j) =>
												j === i ? { ...x, critical: Boolean(v) } : x,
											),
										)
									}
								/>
								{t("providerCritical")}
							</label>
							<Button
								type="button"
								size="icon"
								variant="ghost"
								aria-label={t("remove")}
								onClick={() => setRows(rows.filter((_, j) => j !== i))}
							>
								<Trash2 />
							</Button>
						</li>
					))}
				</ul>
				<div>
					<Button
						type="button"
						size="sm"
						variant="outline"
						disabled={rows.length >= 30}
						onClick={() =>
							setRows([
								...rows,
								{
									key: Math.max(0, ...rows.map((r) => r.key)) + 1,
									name: "",
									service: "",
									category: "it_service",
									critical: false,
								},
							])
						}
					>
						<Plus />
						{t("addProvider")}
					</Button>
				</div>
			</section>

			<fieldset className="flex flex-col gap-2 text-subhead">
				<legend className="mb-1.5 font-medium">{t("personalData")}</legend>
				<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
					{PERSONAL_DATA.map((p) => (
						<label key={p} className="flex items-center gap-2">
							<Checkbox
								checked={pd.includes(p)}
								onCheckedChange={(v) =>
									setPd(v ? [...pd, p] : pd.filter((x) => x !== p))
								}
							/>
							{t(`pd_${p}`)}
						</label>
					))}
				</div>
				<label className="mt-1 flex items-center gap-2">
					<Checkbox
						checked={special}
						onCheckedChange={(v) => setSpecial(Boolean(v))}
					/>
					{t("specialCategories")}
				</label>
			</fieldset>

			<fieldset className="flex flex-col gap-2 text-subhead">
				<legend className="mb-1.5 font-medium">{t("cardData")}</legend>
				<p className="text-muted-foreground text-footnote">
					{t("cardDataHint")}
				</p>
				{CARD_DATA.map((v) => (
					<label key={v} className="flex items-center gap-2">
						<input
							type="radio"
							name="card-data"
							value={v}
							checked={cards === v}
							onChange={() => setCards(v)}
							className="size-4 accent-primary"
						/>
						{t(`cardData_${v}`)}
					</label>
				))}
			</fieldset>

			<fieldset className="flex flex-col gap-2 text-subhead">
				<legend className="mb-1.5 font-medium">{t("aiUse")}</legend>
				<p className="text-muted-foreground text-footnote">{t("aiUseHint")}</p>
				{AI_USE.map((v) => (
					<label key={v} className="flex items-center gap-2">
						<input
							type="radio"
							name="ai-use"
							value={v}
							checked={aiUse === v}
							onChange={() => setAiUse(v)}
							className="size-4 accent-primary"
						/>
						{t(`aiUse_${v}`)}
					</label>
				))}
			</fieldset>

			<fieldset className="flex flex-col gap-2 text-subhead">
				<legend className="mb-1.5 font-medium">{t("moreTitle")}</legend>
				{MORE.map((k) => (
					<label key={k} className="flex items-start gap-2">
						<Checkbox
							className="mt-0.5"
							checked={more[k]}
							onCheckedChange={(v) =>
								setMore((m) => ({ ...m, [k]: Boolean(v) }))
							}
						/>
						{t(k)}
					</label>
				))}
			</fieldset>

			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="it-subjects">{t("dataSubjects")}</Label>
					<Select value={subjects} onValueChange={setSubjects}>
						<SelectTrigger id="it-subjects" className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{SUBJECTS.map((s) => (
								<SelectItem key={s} value={s}>
									{t(`ds_${s}`)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="it-countries">{t("customerCountries")}</Label>
					<Input
						id="it-countries"
						placeholder="DE, AT, CH"
						spellCheck={false}
						value={countries}
						onChange={(e) => setCountries(e.target.value)}
					/>
				</div>
			</div>

			<fieldset className="flex flex-col gap-2 text-subhead">
				<legend className="mb-1.5 font-medium">{t("aiQuestion")}</legend>
				<p className="text-footnote text-muted-foreground">{t("aiLead")}</p>
				{AI_ANSWERS.map((x) => (
					<label key={x} className="flex items-center gap-2">
						<input
							type="radio"
							name="ai"
							value={x}
							checked={ai === x}
							onChange={() => setAi(x)}
							className="size-4 accent-primary"
						/>
						{t(`ai_${x}`)}
					</label>
				))}
			</fieldset>

			<div className="flex justify-end">
				<Button type="submit" disabled={pending}>
					{t("saveNext")}
				</Button>
			</div>
		</form>
	);
}
