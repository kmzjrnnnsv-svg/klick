"use client";

import { Loader2, MessageSquarePlus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import {
	addApplicationNote,
	deleteApplicationNote,
	listApplicationNotes,
} from "@/app/actions/applications";
import { Button } from "@/components/ui/button";

type Note = {
	id: string;
	body: string;
	createdAt: Date;
	authorName: string | null;
	authorEmail: string | null;
};

export function NotesThread({
	applicationId,
	currentUserId,
}: {
	applicationId: string;
	currentUserId: string | null;
}) {
	const t = useTranslations("ApplicationNotes");
	const [notes, setNotes] = useState<Note[]>([]);
	const [body, setBody] = useState("");
	const [isPending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		startTransition(async () => {
			const fresh = await listApplicationNotes(applicationId);
			setNotes(fresh.map((n) => ({ ...n, createdAt: new Date(n.createdAt) })));
			setLoaded(true);
		});
	}, [applicationId]);

	function submit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		if (!body.trim()) return;
		startTransition(async () => {
			const r = await addApplicationNote({ applicationId, body });
			if (!r.ok) {
				setError(r.error);
				return;
			}
			setBody("");
			const fresh = await listApplicationNotes(applicationId);
			setNotes(fresh.map((n) => ({ ...n, createdAt: new Date(n.createdAt) })));
		});
	}

	function remove(id: string) {
		startTransition(async () => {
			const r = await deleteApplicationNote(id);
			if (r.ok) setNotes((prev) => prev.filter((n) => n.id !== id));
			else setError(r.error);
		});
	}

	return (
		<section className="space-y-3">
			<div className="flex items-center gap-2">
				<h2 className="font-medium text-sm">{t("title")}</h2>
				<span className="rounded-full bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] text-amber-700 dark:text-amber-300">
					{t("internal")}
				</span>
			</div>
			<p className="text-muted-foreground text-xs leading-relaxed">
				{t("intro")}
			</p>

			<form onSubmit={submit} className="space-y-2">
				<textarea
					value={body}
					onChange={(e) => setBody(e.target.value)}
					rows={3}
					maxLength={4000}
					placeholder={t("placeholder")}
					className="block w-full rounded-sm border border-border bg-background px-3 py-2 text-sm focus-visible:border-foreground focus-visible:outline-none"
				/>
				<Button type="submit" size="sm" disabled={isPending || !body.trim()}>
					{isPending ? (
						<Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
					) : (
						<MessageSquarePlus className="h-3.5 w-3.5" strokeWidth={1.5} />
					)}
					{t("add")}
				</Button>
			</form>

			{error && (
				<p className="rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-700 text-xs dark:text-rose-300">
					{error}
				</p>
			)}

			{loaded && notes.length === 0 ? (
				<p className="text-muted-foreground text-xs italic">{t("empty")}</p>
			) : (
				<ul className="space-y-2">
					{notes.map((n) => (
						<li
							key={n.id}
							className="rounded-md border border-border bg-muted/30 p-3 text-sm"
						>
							<div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
								<span className="font-mono text-muted-foreground">
									{n.authorName ?? n.authorEmail ?? "Team"} ·{" "}
									{n.createdAt.toLocaleString("de-DE", {
										dateStyle: "short",
										timeStyle: "short",
									})}
								</span>
								{currentUserId && (
									<button
										type="button"
										onClick={() => remove(n.id)}
										className="text-muted-foreground hover:text-rose-600"
										aria-label={t("remove")}
									>
										<Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
									</button>
								)}
							</div>
							<p className="whitespace-pre-wrap leading-relaxed">{n.body}</p>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
