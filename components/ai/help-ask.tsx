"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { aiAskHelp, type HelpAnswer } from "@/app/actions/ai";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { AiAnswerCard, useAiError } from "./ai-answer";

// /hilfe: Frage in eigenen Worten. An die KI gehen nur die Frage und die
// passenden Hilfeartikel von Klick, keine Firmendaten; die Quellen stehen
// als Links unter der Antwort (aus Klick, nicht aus der Antwort der KI).
export function HelpAsk() {
	const t = useTranslations("Ai");
	const fail = useAiError();
	const [question, setQuestion] = useState("");
	const [answer, setAnswer] = useState<HelpAnswer | null>(null);
	const [pending, start] = useTransition();
	return (
		<section
			aria-labelledby="help-ask"
			className="mb-8 flex max-w-2xl flex-col gap-3 rounded-2xl bg-card p-4"
		>
			<h2
				id="help-ask"
				className="flex items-center gap-1.5 font-semibold text-headline"
			>
				<Sparkles aria-hidden="true" className="size-4 text-primary" />
				{t("askTitle")}
			</h2>
			<p className="text-footnote text-muted-foreground">{t("askLead")}</p>
			<form
				className="flex flex-col gap-2 sm:flex-row sm:items-end"
				onSubmit={(e) => {
					e.preventDefault();
					if (question.trim().length < 5) return;
					start(async () => {
						const res = await aiAskHelp({ question });
						if (!res.ok) {
							toast.error(fail(res));
							return;
						}
						setAnswer(res.data);
					});
				}}
			>
				<div className="flex min-w-0 grow flex-col gap-1.5">
					<Label htmlFor="help-question">{t("askLabel")}</Label>
					<Input
						id="help-question"
						name="question"
						value={question}
						maxLength={500}
						autoComplete="off"
						placeholder={t("askPlaceholder")}
						onChange={(e) => setQuestion(e.target.value)}
					/>
				</div>
				<Button
					type="submit"
					disabled={pending || question.trim().length < 5}
					aria-busy={pending}
				>
					{pending ? t("working") : t("ask")}
				</Button>
			</form>
			{answer && (
				<AiAnswerCard answer={answer} onClose={() => setAnswer(null)} />
			)}
			{answer && answer.sources.length > 0 && (
				<div className="flex flex-col gap-1">
					<p className="font-semibold text-footnote">{t("sources")}</p>
					<ul className="flex flex-col gap-1 text-subhead">
						{answer.sources.map((s) => (
							<li key={s.slug}>
								<Link
									href={`/hilfe/${s.slug}`}
									className="text-primary hover:underline"
								>
									{s.title}
								</Link>
							</li>
						))}
					</ul>
				</div>
			)}
		</section>
	);
}
