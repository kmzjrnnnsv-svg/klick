"use client";

import { FileText, ImageIcon, Trash2 } from "lucide-react";
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

function isImage(mime: string) {
	return mime.startsWith("image/");
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
				const Icon = isImage(item.mime) ? ImageIcon : FileText;
				const fileUrl = `/api/vault/${item.id}/file`;
				return (
					<li
						key={item.id}
						className={cn(
							"flex items-center gap-3 px-3 py-3 sm:px-4 sm:py-4",
							pendingId === item.id && "opacity-50",
						)}
					>
						<div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
							<Icon className="h-4 w-4" strokeWidth={1.5} />
						</div>
						<div className="min-w-0 flex-1">
							<a
								href={fileUrl}
								target="_blank"
								rel="noreferrer"
								className="block truncate font-medium text-sm hover:underline"
							>
								{item.filename}
							</a>
							<div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground text-xs">
								<span>{t(`kinds.${item.kind}`)}</span>
								<span>·</span>
								<span>{humanSize(item.sizeBytes)}</span>
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
