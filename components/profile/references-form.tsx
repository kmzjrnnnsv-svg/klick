"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { deleteReference, requestReference } from "@/app/actions/references";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ReferenceCheck } from "@/db/schema";
import { REFERENCE_QUESTIONS } from "@/lib/references/questions";

const STATUS_TONE: Record<ReferenceCheck["status"], string> = {
	pending: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
	submitted: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
	expired: "bg-muted text-muted-foreground",
};

const FLOW_STEPS = ["1", "2", "3"] as const;

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
		<div className="space-y-7">
			<p className="text-muted-foreground text-sm leading-relaxed">
				{t("intro")}
			</p>

			{/* So funktioniert der Referenz-Flow — drei Schritte. */}
			<div>
				<p className="lv-eyebrow text-[0.55rem] text-primary">
					{t("flowHeading")}
				</p>
				<ol className="mt-3 grid gap-3 sm:grid-cols-3">
					{FLOW_STEPS.map((n) => (
						<li
							key={n}
							className="rounded-sm border border-border bg-background p-3"
						>
							<span className="font-mono text-[0.7rem] text-primary tabular-nums">
								{`0${n}`}
							</span>
							<p className="mt-1 font-medium text-sm">{t(`flow.${n}.title`)}</p>
							<p className="mt-1 text-muted-foreground text-xs leading-relaxed">
								{t(`flow.${n}.body`)}
							</p>
						</li>
					))}
				</ol>
			</div>

			{/* Die drei Fragen — transparent vor dem Absenden. */}
			<div className="rounded-sm border border-border bg-muted/30 p-4">
				<p className="lv-eyebrow text-[0.55rem] text-muted-foreground">
					{t("questionsHeading")}
				</p>
				<ol className="mt-2.5 space-y-1.5">
					{REFERENCE_QUESTIONS.map((q, i) => (
						<li key={q} className="grid grid-cols-[auto_1fr] gap-2 text-sm">
							<span className="font-mono text-[11px] text-primary tabular-nums">
								{`${i + 1}.`}
							</span>
							<span className="text-foreground/90 leading-snug">{q}</span>
						</li>
					))}
				</ol>
			</div>

			{/* Einladungs-Formular. */}
			<div className="space-y-2.5">
				<p className="lv-eyebrow text-[0.55rem] text-primary">
					{t("addHeading")}
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
				<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
					<Button onClick={send} disabled={isPending} size="sm">
						{isPending ? t("sending") : t("sendRequest")}
					</Button>
					<p className="text-muted-foreground text-xs">{t("expiresHint")}</p>
				</div>
			</div>

			{/* Bestehende Anfragen. */}
			<div>
				<p className="lv-eyebrow text-[0.55rem] text-muted-foreground">
					{t("listHeading")}
				</p>
				{items.length === 0 ? (
					<p className="mt-3 rounded-sm border border-border border-dashed p-4 text-center text-muted-foreground text-xs">
						{t("emptyState")}
					</p>
				) : (
					<ul className="mt-2 divide-y divide-border border-border border-t border-b">
						{items.map((r) => (
							<li
								key={r.id}
								className="grid grid-cols-[1fr_auto] items-baseline gap-3 py-3"
							>
								<div>
									<div className="flex flex-wrap items-center gap-2">
										<p className="font-medium text-sm">{r.refereeName}</p>
										<span
											className={`lv-eyebrow rounded-sm px-1.5 py-0.5 text-[0.5rem] ${STATUS_TONE[r.status]}`}
										>
											{t(`status.${r.status}`)}
										</span>
									</div>
									<p className="font-mono text-[10px] text-muted-foreground">
										{r.refereeEmail}
										{r.refereeRelation ? ` · ${r.refereeRelation}` : ""}
									</p>
									{r.submittedAt && (
										<p className="mt-1 text-[11px] text-muted-foreground">
											{r.submittedAt.toLocaleDateString()}
										</p>
									)}
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
		</div>
	);
}
