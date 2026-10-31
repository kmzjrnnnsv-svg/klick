"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	copyCustomFrameworkAction,
	createCustomFrameworkAction,
} from "@/app/actions/custom-frameworks";
import { FormDialog } from "@/components/organisation/governance-forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCfError } from "./use-cf-error";

type Way = "empty" | "copy" | "csv";

export const CREATE_ORIGINS = [
	"customer",
	"group",
	"licensed",
	"internal",
] as const;

// Eigenes Rahmenwerk anlegen: leer, als Kopie eines Klick-Rahmenwerks oder
// leer mit anschließendem CSV-Import. Danach geht es in den Editor.
export function CreateCustomFrameworkDialog({
	copyOptions,
}: {
	copyOptions: { slug: string; name: string; requirements: number }[];
}) {
	const t = useTranslations("CustomFrameworks");
	const router = useRouter();
	const fail = useCfError();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const [way, setWay] = useState<Way>("empty");
	const [name, setName] = useState("");
	const [issuer, setIssuer] = useState("");
	const [origin, setOrigin] =
		useState<(typeof CREATE_ORIGINS)[number]>("customer");
	const [slug, setSlug] = useState("");

	const valid = way === "copy" ? slug.length > 0 : name.trim().length >= 2;

	return (
		<FormDialog
			title={t("create")}
			lead={t("createLead")}
			trigger={
				<Button size="sm">
					<Plus aria-hidden="true" />
					{t("create")}
				</Button>
			}
			open={open}
			setOpen={(o) => {
				setOpen(o);
				if (!o) setError(null);
			}}
			pending={pending}
			disabled={!valid}
			error={error}
			onSubmit={() =>
				start(async () => {
					setError(null);
					const res =
						way === "copy"
							? await copyCustomFrameworkAction({
									slug,
									name: name.trim() || undefined,
								})
							: await createCustomFrameworkAction({
									name: name.trim(),
									issuer: issuer.trim() || undefined,
									origin,
								});
					if (!res.ok) return setError(fail(res));
					setOpen(false);
					router.push(
						`/rahmenwerke/eigene/${res.data.id}${way === "csv" ? "?import=1" : ""}`,
					);
				})
			}
		>
			<Tabs value={way} onValueChange={(v) => setWay(v as Way)}>
				<TabsList aria-label={t("create")}>
					<TabsTrigger value="empty">{t("wayEmpty")}</TabsTrigger>
					<TabsTrigger value="copy">{t("wayCopy")}</TabsTrigger>
					<TabsTrigger value="csv">{t("wayCsv")}</TabsTrigger>
				</TabsList>
			</Tabs>
			<p className="text-muted-foreground text-subhead">
				{way === "copy"
					? t("wayCopyHint")
					: way === "csv"
						? t("wayCsvHint")
						: t("wayEmptyHint")}
			</p>
			{way === "copy" ? (
				<>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="cf-copy">{t("copyFrom")}</Label>
						<Select value={slug} onValueChange={setSlug}>
							<SelectTrigger id="cf-copy">
								<SelectValue placeholder={t("copyPick")} />
							</SelectTrigger>
							<SelectContent>
								{copyOptions.map((o) => (
									<SelectItem key={o.slug} value={o.slug}>
										{o.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="cf-copy-name">{t("copyName")}</Label>
						<Input
							id="cf-copy-name"
							name="name"
							autoComplete="off"
							value={name}
							maxLength={120}
							placeholder={t("copyNamePlaceholder")}
							onChange={(e) => setName(e.target.value)}
						/>
					</div>
				</>
			) : (
				<>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="cf-name">{t("name")}</Label>
						<Input
							id="cf-name"
							name="name"
							autoComplete="off"
							required
							value={name}
							maxLength={120}
							placeholder={t("namePlaceholder")}
							onChange={(e) => setName(e.target.value)}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="cf-issuer">{t("issuer")}</Label>
						<Input
							id="cf-issuer"
							name="issuer"
							autoComplete="organization"
							value={issuer}
							maxLength={120}
							placeholder={t("issuerPlaceholder")}
							onChange={(e) => setIssuer(e.target.value)}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="cf-origin">{t("origin")}</Label>
						<Select
							value={origin}
							onValueChange={(v) =>
								setOrigin(v as (typeof CREATE_ORIGINS)[number])
							}
						>
							<SelectTrigger id="cf-origin">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{CREATE_ORIGINS.map((o) => (
									<SelectItem key={o} value={o}>
										{t(`origin_${o}`)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						{origin === "licensed" && (
							<p className="text-footnote text-muted-foreground">
								{t("licensedHint")}
							</p>
						)}
					</div>
				</>
			)}
		</FormDialog>
	);
}
