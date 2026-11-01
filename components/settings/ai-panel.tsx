"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	removeAiKeys,
	saveAiKey,
	saveAiPolicy,
	testAiKey,
} from "@/app/actions/ai-settings";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useConfirm } from "@/components/ui/confirm-alert";
import { errorText, isFourEyesNotice } from "@/components/ui/error-text";
import { FormAlert } from "@/components/ui/form-alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ListGroup, ListRow, ListSection } from "@/components/ui/list";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import {
	AI_CLASS_LEVELS,
	AI_PROVIDERS,
	type AiClassLevel,
	type AiProvider,
} from "@/db/schema/enums";
import {
	AI_FEATURES,
	type AiFeature,
	ANTHROPIC_MODELS,
	DEFAULT_MODEL,
} from "@/lib/ai/options";
import type { AiAdmin, AiPolicy } from "@/lib/ai/policy";

// Einstellungen > KI (ADR-032): eigener Schlüssel der Organisation, Anbieter,
// Modell, welche Inhalte an die KI dürfen und welche Funktionen an sind.
// Speichern lockert über Vier-Augen; ausschalten und verschärfen wirkt
// sofort. Der Schlüssel wird nie wieder angezeigt.

export type AiKeyView = {
	id: string;
	provider: AiProvider;
	keyHint: string;
	active: boolean;
	lastTestOk: "ok" | "failed" | null;
};

type Form = {
	enabled: boolean;
	maxClass: AiClassLevel;
	features: AiFeature[];
	provider: AiProvider | null;
	model: string;
	endpoint: string;
	deployment: string;
	credentialId: string | null;
	dpaConfirmed: boolean;
};

const RANK: Record<AiClassLevel, number> = {
	none: 0,
	public: 1,
	internal: 2,
	confidential: 3,
};

export function AiPanel({
	admin,
	policy,
	keyView,
	canEdit,
	pendingChange,
}: {
	admin: AiAdmin;
	policy: AiPolicy;
	keyView: AiKeyView | null;
	canEdit: boolean;
	pendingChange: boolean;
}) {
	const t = useTranslations("AiSettings");
	const tc = useTranslations("Common");
	const router = useRouter();
	const confirmRemove = useConfirm({
		title: t("removeTitle"),
		description: t("removeLead"),
		confirmLabel: t("remove"),
	});
	const initial: Form = {
		enabled: policy.enabled,
		maxClass: policy.maxClass,
		features: policy.features,
		provider: policy.provider ?? keyView?.provider ?? null,
		model: policy.model ?? "",
		endpoint: policy.endpoint ?? "",
		deployment: policy.deployment ?? "",
		credentialId: keyView?.id ?? policy.credentialId,
		dpaConfirmed: Boolean(policy.dpaConfirmedAt),
	};
	const [form, setForm] = useState<Form>(initial);
	const [key, setKey] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [pending, start] = useTransition();
	const set = <K extends keyof Form>(k: K, v: Form[K]) =>
		setForm((f) => ({ ...f, [k]: v }));
	const aiError = (res: { error?: unknown; ref?: unknown }) => {
		const code = typeof res.error === "string" ? res.error : "";
		return code.startsWith("ai_") && t.has(`err_${code}` as "err_ai_off")
			? t(`err_${code}` as "err_ai_off")
			: errorText(tc, res);
	};
	const editable = canEdit && admin.enabled && !pending;
	const keyMatches = keyView !== null && keyView.provider === form.provider;

	const storeKey = () =>
		start(async () => {
			setError(null);
			if (!form.provider) return setError(t("err_provider"));
			const res = await withStepUp(() =>
				saveAiKey({ provider: form.provider, key }),
			);
			if (!res.ok) {
				if (res.error !== "step_up_required") setError(aiError(res));
				return;
			}
			setKey("");
			set("credentialId", res.data.id);
			toast.success(t("keySaved", { hint: res.data.keyHint }));
			router.refresh();
		});

	const test = () =>
		start(async () => {
			setError(null);
			if (!form.provider || !form.credentialId) return;
			const res = await testAiKey({
				credentialId: form.credentialId,
				provider: form.provider,
				model: form.model,
				endpoint: form.endpoint || null,
				deployment: form.deployment || null,
			});
			if (!res.ok) {
				setError(aiError(res));
				router.refresh();
				return;
			}
			toast.success(t("testOk", { ms: res.data.ms }));
			router.refresh();
		});

	const save = () =>
		start(async () => {
			setError(null);
			const res = await withStepUp(() =>
				saveAiPolicy({
					enabled: form.enabled,
					maxClass: form.maxClass,
					features: form.features,
					provider: form.provider,
					model: form.model || null,
					endpoint: form.endpoint || null,
					deployment: form.deployment || null,
					credentialId: keyMatches ? form.credentialId : null,
					dpaConfirmed: form.dpaConfirmed,
				}),
			);
			if (res.ok) {
				toast.success(t("saved"));
				router.refresh();
				return;
			}
			if (isFourEyesNotice(res)) {
				toast.notice(errorText(tc, res));
				router.refresh();
				return;
			}
			if (res.error !== "step_up_required") setError(aiError(res));
		});

	const remove = () =>
		confirmRemove.ask(() =>
			start(async () => {
				const res = await withStepUp(() => removeAiKeys());
				if (!res.ok) {
					if (res.error !== "step_up_required") setError(aiError(res));
					return;
				}
				toast.success(t("removed"));
				router.refresh();
			}),
		);

	const classOptions = AI_CLASS_LEVELS.filter(
		(c) => RANK[c] <= RANK[admin.maxClass],
	);

	return (
		<ListGroup>
			<ListSection title={t("statusTitle")} footer={t("lead")}>
				<ListRow
					title={t("adminTitle")}
					subtitle={
						admin.enabled
							? t("adminOn", {
									mode: t(`mode_${admin.mode}`),
									max: t(`class_${admin.maxClass}`),
								})
							: t("adminOff")
					}
					accessory={
						<Badge variant={admin.enabled ? "success" : "muted"}>
							{admin.enabled ? t("on") : t("off")}
						</Badge>
					}
				/>
				<ListRow
					title={t("enabled")}
					subtitle={pendingChange ? t("pendingChange") : undefined}
					accessory={
						<Switch
							aria-label={t("enabled")}
							checked={form.enabled}
							disabled={!editable}
							onCheckedChange={(on) => set("enabled", on)}
						/>
					}
				/>
			</ListSection>

			<ListSection title={t("providerTitle")} footer={t("providerFooter")}>
				<ListRow>
					<div className="grid gap-2 py-1">
						<Label htmlFor="ai-provider">{t("provider")}</Label>
						<Select
							value={form.provider ?? ""}
							onValueChange={(v) => {
								const p = v as AiProvider;
								setForm((f) => ({
									...f,
									provider: p,
									model: DEFAULT_MODEL[p] ?? (f.provider === p ? f.model : ""),
								}));
							}}
							disabled={!editable}
						>
							<SelectTrigger id="ai-provider" className="w-full">
								<SelectValue placeholder={t("providerPlaceholder")} />
							</SelectTrigger>
							<SelectContent>
								{AI_PROVIDERS.map((p) => (
									<SelectItem key={p} value={p}>
										{t(`provider_${p}`)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						{form.provider && (
							<p className="text-footnote text-muted-foreground">
								{t(`providerHint_${form.provider}`)}
							</p>
						)}
					</div>
				</ListRow>
				{form.provider && (
					<ListRow>
						<div className="grid gap-2 py-1">
							<Label htmlFor="ai-model">{t("model")}</Label>
							{form.provider === "anthropic" ? (
								<Select
									value={form.model}
									onValueChange={(v) => set("model", v)}
									disabled={!editable}
								>
									<SelectTrigger id="ai-model" className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{ANTHROPIC_MODELS.map((m) => (
											<SelectItem key={m} value={m}>
												{m}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							) : (
								<Input
									id="ai-model"
									name="ai-model"
									autoComplete="off"
									spellCheck={false}
									value={form.model}
									maxLength={120}
									placeholder={t(`modelPlaceholder_${form.provider}`)}
									disabled={!editable}
									onChange={(e) => set("model", e.target.value)}
								/>
							)}
						</div>
					</ListRow>
				)}
				{(form.provider === "azure_openai" ||
					form.provider === "openai_compatible") && (
					<ListRow>
						<div className="grid gap-2 py-1">
							<Label htmlFor="ai-endpoint">
								{t(
									form.provider === "azure_openai"
										? "endpointAzure"
										: "endpointCompatible",
								)}
							</Label>
							<Input
								id="ai-endpoint"
								name="ai-endpoint"
								type="url"
								inputMode="url"
								autoComplete="off"
								spellCheck={false}
								value={form.endpoint}
								maxLength={300}
								placeholder={t(
									form.provider === "azure_openai"
										? "endpointAzurePlaceholder"
										: "endpointCompatiblePlaceholder",
								)}
								disabled={!editable}
								onChange={(e) => set("endpoint", e.target.value)}
							/>
						</div>
					</ListRow>
				)}
				{form.provider === "azure_openai" && (
					<ListRow>
						<div className="grid gap-2 py-1">
							<Label htmlFor="ai-deployment">{t("deployment")}</Label>
							<Input
								id="ai-deployment"
								name="ai-deployment"
								autoComplete="off"
								spellCheck={false}
								value={form.deployment}
								maxLength={120}
								placeholder={t("deploymentPlaceholder")}
								disabled={!editable}
								onChange={(e) => set("deployment", e.target.value)}
							/>
						</div>
					</ListRow>
				)}
			</ListSection>

			<ListSection title={t("keyTitle")} footer={t("keyFooter")}>
				{keyView && (
					<ListRow
						title={t("keyStored", { hint: keyView.keyHint })}
						subtitle={
							keyView.provider !== form.provider
								? t("keyOtherProvider", {
										provider: t(`provider_${keyView.provider}`),
									})
								: keyView.active
									? t("keyActive")
									: t("keyNotActive")
						}
						accessory={
							keyView.lastTestOk ? (
								<Badge
									variant={keyView.lastTestOk === "ok" ? "success" : "warning"}
								>
									{t(`test_${keyView.lastTestOk}`)}
								</Badge>
							) : undefined
						}
					/>
				)}
				<ListRow>
					<div className="grid gap-2 py-1">
						<Label htmlFor="ai-key">
							{keyView ? t("keyReplace") : t("keyNew")}
						</Label>
						<div className="flex flex-col gap-2 sm:flex-row">
							<Input
								id="ai-key"
								name="ai-key"
								type="password"
								autoComplete="off"
								spellCheck={false}
								value={key}
								maxLength={400}
								placeholder={t("keyPlaceholder")}
								disabled={!editable}
								onChange={(e) => setKey(e.target.value)}
							/>
							<Button
								type="button"
								variant="secondary"
								disabled={!editable || key.trim().length < 16 || !form.provider}
								onClick={storeKey}
							>
								{t("keySave")}
							</Button>
						</div>
					</div>
				</ListRow>
				{keyView && (
					<ListRow
						accessory={
							<div className="flex flex-wrap gap-2">
								<Button
									type="button"
									variant="secondary"
									size="sm"
									disabled={!editable || !keyMatches || !form.model}
									onClick={test}
								>
									{t("test")}
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="text-destructive"
									disabled={!canEdit || pending}
									onClick={remove}
								>
									{t("remove")}
								</Button>
							</div>
						}
						title={t("testLead")}
					/>
				)}
			</ListSection>

			<ListSection title={t("contentTitle")} footer={t("contentFooter")}>
				<ListRow>
					<div className="grid gap-2 py-1">
						<Label htmlFor="ai-class">{t("maxClass")}</Label>
						<Select
							value={form.maxClass}
							onValueChange={(v) => set("maxClass", v as AiClassLevel)}
							disabled={!editable}
						>
							<SelectTrigger id="ai-class" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{classOptions.map((c) => (
									<SelectItem key={c} value={c}>
										{t(`class_${c}`)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</ListRow>
			</ListSection>

			<ListSection title={t("featuresTitle")} footer={t("featuresFooter")}>
				{AI_FEATURES.map((f) => (
					<ListRow
						key={f}
						title={t(`feature_${f}`)}
						subtitle={t(`featureHint_${f}`)}
						accessory={
							<Switch
								aria-label={t(`feature_${f}`)}
								checked={form.features.includes(f)}
								disabled={!editable}
								onCheckedChange={(on) =>
									set(
										"features",
										on
											? [...form.features, f]
											: form.features.filter((x) => x !== f),
									)
								}
							/>
						}
					/>
				))}
			</ListSection>

			<ListSection title={t("dpaTitle")}>
				<ListRow>
					<div className="flex items-start gap-3 py-1">
						<Checkbox
							id="ai-dpa"
							checked={form.dpaConfirmed}
							disabled={!editable}
							onCheckedChange={(v) => set("dpaConfirmed", v === true)}
						/>
						<Label htmlFor="ai-dpa" className="font-normal leading-snug">
							{t("dpa")}
						</Label>
					</div>
					{form.provider === "gemini" && (
						<p className="pb-1 text-footnote text-muted-foreground">
							{t("dpaGemini")}
						</p>
					)}
				</ListRow>
			</ListSection>

			{canEdit && (
				<div className="flex flex-col gap-3">
					{!admin.enabled && (
						<p className="text-footnote text-muted-foreground">
							{t("adminOffHint")}
						</p>
					)}
					<FormAlert message={error} />
					<p className="text-footnote text-muted-foreground">{t("saveHint")}</p>
					<div className="flex justify-end">
						<Button disabled={!editable} onClick={save}>
							{pending ? tc("saving") : t("save")}
						</Button>
					</div>
				</div>
			)}
			{confirmRemove.node}
		</ListGroup>
	);
}
