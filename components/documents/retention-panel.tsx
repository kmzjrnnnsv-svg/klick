"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { updateDocument } from "@/app/actions/documents";
import { Button } from "@/components/ui/button";
import { errorText } from "@/components/ui/error-text";
import { FormAlert } from "@/components/ui/form-alert";
import { Input, nativeSelectClass } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import {
	EXTERNAL_KINDS,
	type ExternalKind,
	type ExternalSource,
} from "@/db/schema/enums";

// Aufbewahrung der Fassungen und Herkunft eines externen Dokuments (AP9.3,
// ISO 27001 7.5.3). Speichern über updateDocument.
export function RetentionPanel({
	documentId,
	retentionYears,
	suggestedYears,
	external,
	canEdit,
}: {
	documentId: string;
	retentionYears: number | null;
	suggestedYears: number;
	external: ExternalSource | null;
	canEdit: boolean;
}) {
	const t = useTranslations("DocumentRetention");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const [years, setYears] = useState(
		retentionYears === null ? "" : String(retentionYears),
	);
	const [isExternal, setIsExternal] = useState(external !== null);
	const [kind, setKind] = useState<ExternalKind>(external?.kind ?? "standard");
	const [issuer, setIssuer] = useState(external?.issuer ?? "");
	const [edition, setEdition] = useState(external?.edition ?? "");
	const [url, setUrl] = useState(external?.url ?? "");

	if (!canEdit)
		return (
			<dl className="grid grid-cols-1 gap-2 text-subhead sm:grid-cols-2">
				<div>
					<dt className="text-muted-foreground text-footnote">{t("years")}</dt>
					<dd>
						{t("yearsValue", { years: retentionYears ?? suggestedYears })}
					</dd>
				</div>
				{external && (
					<div>
						<dt className="text-muted-foreground text-footnote">
							{t("externalTitle")}
						</dt>
						<dd className="break-words">
							{t(`kind_${external.kind}`)} · {external.issuer} ·{" "}
							{external.edition}
						</dd>
					</div>
				)}
			</dl>
		);

	const save = () =>
		start(async () => {
			setError(null);
			const res = await updateDocument({
				documentId,
				retentionYears: years.trim() === "" ? null : Number(years),
				externalSource: isExternal
					? {
							kind,
							issuer: issuer.trim(),
							edition: edition.trim(),
							url: url.trim() === "" ? null : url.trim(),
						}
					: null,
			});
			if (!res.ok) return setError(errorText(tc, res));
			toast.success(t("saved"));
			router.refresh();
		});

	return (
		<form
			className="flex flex-col gap-4"
			onSubmit={(e) => {
				e.preventDefault();
				save();
			}}
		>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="ret-years">{t("years")}</Label>
				<Input
					id="ret-years"
					name="retentionYears"
					type="number"
					inputMode="numeric"
					min={0}
					max={30}
					className="sm:w-40"
					placeholder={t("yearsPlaceholder", { years: suggestedYears })}
					value={years}
					onChange={(e) => setYears(e.target.value)}
				/>
				<p className="text-footnote text-muted-foreground">{t("yearsHint")}</p>
			</div>
			<div className="flex items-center justify-between gap-3 rounded-2xl bg-card p-3">
				<Label
					htmlFor="ret-external"
					className="flex flex-col items-start gap-0.5 text-left"
				>
					<span>{t("externalTitle")}</span>
					<span className="font-normal text-footnote text-muted-foreground">
						{t("externalHint")}
					</span>
				</Label>
				<Switch
					id="ret-external"
					checked={isExternal}
					onCheckedChange={setIsExternal}
				/>
			</div>
			{isExternal && (
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="ret-kind">{t("kind")}</Label>
						<select
							id="ret-kind"
							name="kind"
							className={nativeSelectClass}
							value={kind}
							onChange={(e) => setKind(e.target.value as ExternalKind)}
						>
							{EXTERNAL_KINDS.map((k) => (
								<option key={k} value={k}>
									{t(`kind_${k}`)}
								</option>
							))}
						</select>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="ret-issuer">{t("issuer")}</Label>
						<Input
							id="ret-issuer"
							name="issuer"
							autoComplete="off"
							placeholder={t("issuerPlaceholder")}
							value={issuer}
							onChange={(e) => setIssuer(e.target.value)}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="ret-edition">{t("edition")}</Label>
						<Input
							id="ret-edition"
							name="edition"
							autoComplete="off"
							placeholder={t("editionPlaceholder")}
							value={edition}
							onChange={(e) => setEdition(e.target.value)}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="ret-url">{t("url")}</Label>
						<Input
							id="ret-url"
							name="url"
							type="url"
							inputMode="url"
							autoComplete="off"
							spellCheck={false}
							placeholder={t("urlPlaceholder")}
							value={url}
							onChange={(e) => setUrl(e.target.value)}
						/>
					</div>
				</div>
			)}
			<FormAlert message={error} />
			<div className="flex justify-end">
				<Button type="submit" disabled={pending} aria-busy={pending}>
					{pending ? t("saving") : tc("save")}
				</Button>
			</div>
		</form>
	);
}
