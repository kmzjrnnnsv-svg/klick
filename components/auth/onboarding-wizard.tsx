"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { createOrganizationAction } from "@/app/actions/onboarding";
import { SynergyPreviewPanel } from "@/components/auth/synergy-preview";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { CASP_SERVICES, LICENCE_STAGES } from "@/db/schema/enums";
import { cn } from "@/lib/utils";
import {
	type CreateOrganizationFormInput,
	type CreateOrganizationInput,
	createOrganizationSchema,
} from "@/lib/validation/org";

type FrameworkOption = {
	slug: string;
	name: string;
	description: string | null;
};

const SERVICE_LABEL: Record<(typeof CASP_SERVICES)[number], string> = {
	custody: "Verwahrung",
	exchange: "Tausch",
	transfer: "Transfer / Zahlung",
	fiat_onramp: "Fiat-Anbindung",
	platform: "Handelsplattform",
	execution: "Ausführung von Aufträgen",
	placing: "Platzierung",
	reception_transmission: "Annahme & Übermittlung",
	advice: "Beratung",
	portfolio: "Portfolioverwaltung",
};

function slugify(name: string): string {
	return name
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/ä/g, "ae")
		.replace(/ö/g, "oe")
		.replace(/ü/g, "ue")
		.replace(/ß/g, "ss")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48);
}

export function OnboardingWizard({
	frameworks,
	canApplyBaseline,
}: {
	frameworks: FrameworkOption[];
	canApplyBaseline: boolean;
}) {
	const t = useTranslations("Onboarding");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [step, setStep] = useState(0);
	const [busy, setBusy] = useState(false);

	const form = useForm<
		CreateOrganizationFormInput,
		unknown,
		CreateOrganizationInput
	>({
		resolver: zodResolver(createOrganizationSchema),
		defaultValues: {
			name: "",
			slug: "",
			sector: "other",
			licenceStage: "0_vorbereitung",
			caspServices: [],
			frameworks: ["iso27001"],
			applyBaseline: false,
		},
		mode: "onBlur",
	});

	const sector = form.watch("sector");
	const selected = form.watch("frameworks") ?? [];
	const showCasp = selected.includes("micar") || sector === "casp";

	async function next() {
		const fields: (keyof CreateOrganizationFormInput)[][] = [
			["name", "slug", "sector", "licenceStage"],
			["frameworks", "caspServices"],
		];
		const ok = await form.trigger(fields[step]);
		if (ok) setStep((s) => s + 1);
	}

	async function submit(values: CreateOrganizationInput) {
		setBusy(true);
		const res = await createOrganizationAction(values);
		setBusy(false);
		if (!res.ok) {
			if (res.error === "slugTaken") {
				form.setError("slug", { message: t("slugTaken") });
				setStep(0);
			} else if (res.error === "alreadyMember") {
				toast.error(t("alreadyMember"));
				router.replace("/heute");
			} else {
				toast.error(tc("error"));
			}
			return;
		}
		toast.success(t("created"));
		router.replace("/ueberblick");
		router.refresh();
	}

	const steps = [t("step1"), t("step2"), t("step3")];

	return (
		<Form {...form}>
			<form
				onSubmit={form.handleSubmit(submit)}
				className="flex flex-col gap-8"
			>
				<ol className="flex gap-4">
					{steps.map((label, i) => (
						<li
							key={label}
							className={cn(
								"lv-eyebrow text-[0.6rem]",
								i === step ? "text-foreground" : "text-muted-foreground",
							)}
						>
							{i + 1} · {label}
						</li>
					))}
				</ol>

				{step === 0 && (
					<div className="flex flex-col gap-5">
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("orgName")}</FormLabel>
									<FormControl>
										<Input
											{...field}
											onChange={(e) => {
												field.onChange(e);
												if (!form.getFieldState("slug").isDirty)
													form.setValue("slug", slugify(e.target.value));
											}}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="slug"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("orgSlug")}</FormLabel>
									<FormControl>
										<Input {...field} className="font-mono" />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<div className="grid gap-5 sm:grid-cols-2">
							<FormField
								control={form.control}
								name="sector"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("sector")}</FormLabel>
										<Select
											value={field.value ?? "other"}
											onValueChange={field.onChange}
										>
											<FormControl>
												<SelectTrigger className="w-full">
													<SelectValue />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												<SelectItem value="casp">{t("sectorCasp")}</SelectItem>
												<SelectItem value="payment">
													{t("sectorPayment")}
												</SelectItem>
												<SelectItem value="emi">{t("sectorEmi")}</SelectItem>
												<SelectItem value="bank">{t("sectorBank")}</SelectItem>
												<SelectItem value="other">
													{t("sectorOther")}
												</SelectItem>
											</SelectContent>
										</Select>
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="licenceStage"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("licenceStage")}</FormLabel>
										<Select
											value={field.value ?? "0_vorbereitung"}
											onValueChange={field.onChange}
										>
											<FormControl>
												<SelectTrigger className="w-full">
													<SelectValue />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												{LICENCE_STAGES.map((s, i) => (
													<SelectItem key={s} value={s}>
														{t(`stage${i}` as "stage0")}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</FormItem>
								)}
							/>
						</div>
					</div>
				)}

				{step === 1 && (
					<div className="flex flex-col gap-6">
						<FormField
							control={form.control}
							name="frameworks"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("frameworks")}</FormLabel>
									<FormDescription>{t("frameworksHint")}</FormDescription>
									<div className="mt-2 grid gap-2 sm:grid-cols-2">
										{frameworks.map((f) => {
											const checked = field.value.includes(f.slug);
											return (
												<label
													key={f.slug}
													className={cn(
														"flex cursor-pointer gap-3 rounded-md border p-3 text-sm transition-colors hover:bg-muted/50",
														checked && "border-primary/60 bg-primary/5",
													)}
												>
													<Checkbox
														checked={checked}
														onCheckedChange={(v) =>
															field.onChange(
																v
																	? [...field.value, f.slug]
																	: field.value.filter((s) => s !== f.slug),
															)
														}
														className="mt-0.5"
													/>
													<span>
														<span className="font-medium">{f.name}</span>
														{f.description && (
															<span className="mt-0.5 block line-clamp-2 text-muted-foreground text-xs">
																{f.description}
															</span>
														)}
													</span>
												</label>
											);
										})}
									</div>
									<FormMessage />
								</FormItem>
							)}
						/>
						{showCasp && (
							<FormField
								control={form.control}
								name="caspServices"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("caspServices")}</FormLabel>
										<div className="mt-2 flex flex-wrap gap-2">
											{CASP_SERVICES.map((s) => {
												const current = field.value ?? [];
												const checked = current.includes(s);
												return (
													<label
														key={s}
														className={cn(
															"flex cursor-pointer items-center gap-2 rounded-sm border px-3 py-1.5 text-xs",
															checked && "border-primary/60 bg-primary/5",
														)}
													>
														<Checkbox
															checked={checked}
															onCheckedChange={(v) =>
																field.onChange(
																	v
																		? [...current, s]
																		: current.filter((x) => x !== s),
																)
															}
														/>
														{SERVICE_LABEL[s]}
													</label>
												);
											})}
										</div>
									</FormItem>
								)}
							/>
						)}
						<SynergyPreviewPanel
							frameworks={selected}
							sector={sector ?? "other"}
							licenceStage={form.watch("licenceStage") ?? "0_vorbereitung"}
							caspServices={form.watch("caspServices") ?? []}
							names={Object.fromEntries(
								frameworks.map((f) => [f.slug, f.name]),
							)}
						/>
					</div>
				)}

				{step === 2 && (
					<div className="flex flex-col gap-4">
						<p className="lv-eyebrow text-[0.58rem] text-muted-foreground">
							{t("summary")}
						</p>
						<dl className="grid gap-2 text-sm sm:grid-cols-2">
							<dt className="text-muted-foreground">{t("orgName")}</dt>
							<dd>{form.getValues("name")}</dd>
							<dt className="text-muted-foreground">{t("orgSlug")}</dt>
							<dd className="font-mono">{form.getValues("slug")}</dd>
							<dt className="text-muted-foreground">{t("licenceStage")}</dt>
							<dd>
								{t(
									`stage${LICENCE_STAGES.indexOf(form.getValues("licenceStage") ?? "0_vorbereitung")}` as "stage0",
								)}
							</dd>
							<dt className="text-muted-foreground">{t("frameworks")}</dt>
							<dd>
								{form
									.getValues("frameworks")
									.map(
										(slug) =>
											frameworks.find((f) => f.slug === slug)?.name ?? slug,
									)
									.join(", ")}
							</dd>
						</dl>
						{canApplyBaseline && (
							<FormField
								control={form.control}
								name="applyBaseline"
								render={({ field }) => (
									<FormItem className="flex flex-row items-center gap-3">
										<FormControl>
											<Checkbox
												checked={field.value ?? false}
												onCheckedChange={(v) => field.onChange(Boolean(v))}
											/>
										</FormControl>
										<FormLabel className="normal-case tracking-normal text-foreground">
											{t("applyBaseline")}
										</FormLabel>
									</FormItem>
								)}
							/>
						)}
					</div>
				)}

				<div className="flex items-center justify-between">
					<Button
						type="button"
						variant="ghost"
						disabled={step === 0 || busy}
						onClick={() => setStep((s) => s - 1)}
					>
						{tc("back")}
					</Button>
					{step < 2 ? (
						<Button type="button" onClick={next}>
							{tc("next")}
						</Button>
					) : (
						<Button type="submit" variant="brown" disabled={busy}>
							{t("create")}
						</Button>
					)}
				</div>
			</form>
		</Form>
	);
}
