"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { deleteReference, requestReference } from "@/app/actions/references";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ReferenceCheck } from "@/db/schema";

export function ReferencesForm({ initial }: { initial: ReferenceCheck[] }) {
	const t = useTranslations("References");
	const [items, setItems] = useState(initial);
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [relation, setRelation] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();

	function send() {
		setError(null);
		if (!name.trim() || !email.trim()) {
			setError(t("nameEmailRequired"));
			return;
		}
		startTransition(async () => {
			try {
				await requestReference({
					refereeName: name,
					refereeEmail: email,
					refereeRelation: relation || undefined,
				});
				setName("");
				setEmail("");
				setRelation("");
				// Soft refresh: leave reload to RSC.
				window.location.reload();
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			}
		});
	}

	function remove(id: string) {
		startTransition(async () => {
			await deleteReference(id);
			setItems((xs) => xs.filter((x) => x.id !== id));
		});
	}

	return (
		<div className="space-y-4">
			<p className="text-muted-foreground text-xs leading-relaxed">
				{t("hint")}
			</p>
			<div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
				<Input
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder={t("namePlaceholder")}
				/>
				<Input
					type="email"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					placeholder={t("emailPlaceholder")}
				/>
				<Input
					value={relation}
					onChange={(e) => setRelation(e.target.value)}
					placeholder={t("relationPlaceholder")}
				/>
			</div>
			{error && (
				<p className="text-rose-700 text-xs dark:text-rose-300">{error}</p>
			)}
			<Button onClick={send} disabled={isPending} size="sm">
				{isPending ? t("sending") : t("sendRequest")}
			</Button>

			{items.length > 0 && (
				<ul className="divide-y divide-border border-border border-t border-b">
					{items.map((r) => (
						<li
							key={r.id}
							className="grid grid-cols-[1fr_auto] items-baseline gap-3 py-3"
						>
							<div>
								<p className="font-medium text-sm">{r.refereeName}</p>
								<p className="font-mono text-[10px] text-muted-foreground">
									{r.refereeEmail}
									{r.refereeRelation ? ` · ${r.refereeRelation}` : ""}
								</p>
								<p className="mt-1 text-[11px]">
									{t(`status.${r.status}`)}
									{r.submittedAt && ` · ${r.submittedAt.toLocaleDateString()}`}
								</p>
								{r.answers && r.answers.length > 0 && (
									<details className="mt-2 text-xs">
										<summary className="cursor-pointer text-muted-foreground hover:text-foreground">
											{t("showAnswers")}
										</summary>
										<dl className="mt-2 space-y-2">
											{r.answers.map((a) => (
												<div
													key={a.question.slice(0, 32)}
													className="rounded-sm bg-muted/40 p-2"
												>
													<dt className="font-medium">{a.question}</dt>
													<dd className="mt-1 text-muted-foreground">
														{a.answer}
													</dd>
												</div>
											))}
										</dl>
									</details>
								)}
							</div>
							<button
								type="button"
								onClick={() => remove(r.id)}
								disabled={isPending}
								className="text-muted-foreground hover:text-rose-700"
								aria-label={t("delete")}
							>
								<Trash2 className="h-4 w-4" strokeWidth={1.5} />
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
