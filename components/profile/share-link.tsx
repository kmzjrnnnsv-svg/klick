"use client";

import { Copy, Link as LinkIcon, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
	generatePublicShareToken,
	revokePublicShareToken,
} from "@/app/actions/public-profile";
import { Button } from "@/components/ui/button";

export function ShareLink({ initialToken }: { initialToken: string | null }) {
	const t = useTranslations("Profile.share");
	const [token, setToken] = useState(initialToken);
	const [copied, setCopied] = useState(false);
	const [isPending, startTransition] = useTransition();

	const url =
		token && typeof window !== "undefined"
			? `${window.location.origin}/p/${token}`
			: token
				? `/p/${token}`
				: null;

	function handleGenerate() {
		startTransition(async () => {
			const t = await generatePublicShareToken();
			setToken(t);
			setCopied(false);
		});
	}

	function handleRevoke() {
		startTransition(async () => {
			await revokePublicShareToken();
			setToken(null);
			setCopied(false);
		});
	}

	function copy() {
		if (!url) return;
		navigator.clipboard.writeText(url);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	}

	return (
		<div className="rounded-lg border border-border bg-background p-3 sm:p-4">
			<div className="mb-1.5 flex items-center gap-2 font-medium text-sm">
				<LinkIcon className="h-4 w-4" strokeWidth={1.5} />
				{t("title")}
			</div>
			<p className="mb-3 text-muted-foreground text-xs leading-snug">
				{t("subtitle")}
			</p>

			{!token ? (
				<Button
					type="button"
					size="sm"
					onClick={handleGenerate}
					disabled={isPending}
				>
					{t("generate")}
				</Button>
			) : (
				<div className="space-y-2">
					<div className="flex items-stretch gap-2">
						<input
							readOnly
							value={url ?? ""}
							className="h-9 flex-1 rounded-md border border-border bg-muted px-2 font-mono text-xs"
						/>
						<Button type="button" size="sm" variant="outline" onClick={copy}>
							<Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
							{copied ? t("copied") : t("copy")}
						</Button>
					</div>
					<Button
						type="button"
						size="sm"
						variant="ghost"
						onClick={handleRevoke}
						disabled={isPending}
					>
						<X className="h-3.5 w-3.5" strokeWidth={1.5} />
						{t("revoke")}
					</Button>
				</div>
			)}
		</div>
	);
}
