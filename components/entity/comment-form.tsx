"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addComment } from "@/app/actions/comments";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { EntityKind } from "@/db/schema/enums";

export function CommentForm({
	entityType,
	entityId,
	link,
}: {
	entityType: EntityKind;
	entityId: string;
	link: string;
}) {
	const t = useTranslations("Entity");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [body, setBody] = useState("");
	const [pending, start] = useTransition();

	return (
		<form
			className="flex flex-col gap-2"
			onSubmit={(e) => {
				e.preventDefault();
				if (body.trim().length === 0) return;
				start(async () => {
					const res = await addComment(
						{ entityType, entityId, bodyMarkdown: body },
						link,
					);
					if (!res.ok) {
						toast.error(tc("error"));
						return;
					}
					setBody("");
					if (res.data.mentioned > 0)
						toast.success(t("mentioned", { n: res.data.mentioned }));
					router.refresh();
				});
			}}
		>
			<Textarea
				value={body}
				onChange={(e) => setBody(e.target.value)}
				rows={3}
				placeholder={t("commentPlaceholder")}
				aria-label={t("comment")}
			/>
			<div className="flex items-center justify-between gap-2">
				<span className="text-muted-foreground text-xs">
					{t("mentionHint")}
				</span>
				<Button
					type="submit"
					size="sm"
					disabled={pending || body.trim().length === 0}
				>
					{t("comment")}
				</Button>
			</div>
		</form>
	);
}
