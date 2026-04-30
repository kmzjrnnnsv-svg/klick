"use client";

import { Award, FileText, ImageIcon, Sparkles, Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { deleteVaultItem } from "@/app/actions/vault";
import { Button } from "@/components/ui/button";
import type { VaultItem } from "@/db/schema";
import { cn } from "@/lib/utils";

function humanSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`;
	return `${Math.round(bytes / 104857.6) / 10} MB`;
}

function isImage(mime: string | null) {
	return !!mime && mime.startsWith("image/");
}

// Cherry-pick a single short label from extracted metadata so the list stays
// scannable. Falls back to nothing — the row is still readable from filename.
function extractedSummary(item: VaultItem): string | null {
	const meta = item.extractedMeta;
	if (!meta) return null;
	const data = meta.data as Record<string, unknown>;
	const str = (k: string) =>
		typeof data[k] === "string" ? (data[k] as string) : null;

	switch (meta.kind) {
		case "cv": {
			const skills = data.skills;
			if (Array.isArray(skills) && skills.length > 0) {
				const names = skills
					.map((s) =>
						typeof s === "object" && s && "name" in s
							? (s as { name: unknown }).name
							: null,
					)
					.filter((n): n is string => typeof n === "string")
					.slice(0, 3);
				if (names.length > 0) return names.join(" · ");
			}
			return str("headline") ?? str("displayName");
		}
		case "certificate":
			return [str("title"), str("issuer")].filter(Boolean).join(" — ") || null;
		case "id_doc":
			return str("docType");
		case "badge":
			return str("name") ?? str("issuerName");
		default:
			return str("title");
	}
}

export function VaultList({ items }: { items: VaultItem[] }) {
	const t = useTranslations("Vault");
	const fmt = useFormatter();
	const [pendingId, setPendingId] = useState<string | null>(null);
	const [, startTransition] = useTransition();

	if (items.length === 0) {
		return (
			<div className="rounded-lg border border-border border-dashed p-10 text-center sm:p-16">
				<p className="text-muted-foreground text-sm">{t("empty")}</p>
			</div>
		);
	}

	return (
		<ul className="divide-y divide-border rounded-lg border border-border bg-background">
			{items.map((item) => {
				const isUrlBadge = !!item.sourceUrl && !item.storageKey;
				const Icon = isUrlBadge
					? Award
					: isImage(item.mime)
						? ImageIcon
						: FileText;
				const href = isUrlBadge ? item.sourceUrl : `/api/vault/${item.id}/file`;
				const displayName =
					isUrlBadge && item.badgeMeta?.name
						? item.badgeMeta.name
						: item.filename;
				return (
					<li
						key={item.id}
						className={cn(
							"flex items-center gap-3 px-3 py-3 sm:px-4 sm:py-4",
							pendingId === item.id && "opacity-50",
						)}
					>
						<div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-md bg-muted text-muted-foreground">
							{isUrlBadge && item.badgeMeta?.imageUrl ? (
								// biome-ignore lint/performance/noImgElement: external badge image, next/image would need allowlisting
								<img
									src={item.badgeMeta.imageUrl}
									alt=""
									className="h-full w-full object-cover"
								/>
							) : (
								<Icon className="h-4 w-4" strokeWidth={1.5} />
							)}
						</div>
						<div className="min-w-0 flex-1">
							<a
								href={href ?? "#"}
								target="_blank"
								rel="noreferrer"
								className="block truncate font-medium text-sm hover:underline"
							>
								{displayName}
							</a>
							<div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground text-xs">
								<span>{t(`kinds.${item.kind}`)}</span>
								{isUrlBadge && item.badgeMeta?.issuerName && (
									<>
										<span>·</span>
										<span>{item.badgeMeta.issuerName}</span>
									</>
								)}
								{!isUrlBadge && item.sizeBytes != null && (
									<>
										<span>·</span>
										<span>{humanSize(item.sizeBytes)}</span>
									</>
								)}
								<span>·</span>
								<span>
									{fmt.dateTime(item.createdAt, {
										dateStyle: "medium",
										timeStyle: "short",
									})}
								</span>
								{item.tags && item.tags.length > 0 && (
									<>
										<span>·</span>
										<span className="font-mono">
											{item.tags.map((t) => `#${t}`).join(" ")}
										</span>
									</>
								)}
							</div>
							{(() => {
								const summary = extractedSummary(item);
								if (summary) {
									return (
										<div className="mt-1 flex items-center gap-1.5 text-primary text-xs">
											<Sparkles
												className="h-3 w-3 shrink-0"
												strokeWidth={1.5}
											/>
											<span className="truncate">{summary}</span>
										</div>
									);
								}
								if (!isUrlBadge && item.storageKey && !item.extractedAt) {
									return (
										<div className="mt-1 text-muted-foreground text-xs italic">
											{t("extracting")}
										</div>
									);
								}
								return null;
							})()}
						</div>
						<form
							action={(fd) => {
								const id = String(fd.get("id"));
								setPendingId(id);
								startTransition(async () => {
									try {
										await deleteVaultItem(id);
									} finally {
										setPendingId(null);
									}
								});
							}}
						>
							<input type="hidden" name="id" value={item.id} />
							<Button
								type="submit"
								variant="ghost"
								size="icon"
								disabled={pendingId === item.id}
								aria-label={t("delete")}
							>
								<Trash2 className="h-4 w-4" strokeWidth={1.5} />
							</Button>
						</form>
					</li>
				);
			})}
		</ul>
	);
}
