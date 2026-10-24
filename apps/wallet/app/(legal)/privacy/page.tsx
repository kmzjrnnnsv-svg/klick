import { PRIVACY_AS_OF, PRIVACY_SECTIONS } from "@wallet/lib/legal/privacy";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { legalDisplayName, legalEntityFrom } from "@/lib/legal/entity";
import { PLATFORM_MAIL } from "@/lib/mail/address";

export const metadata: Metadata = { title: "Datenschutz" };
export const dynamic = "force-dynamic";

export default async function PrivacyPage() {
	const t = await getTranslations("Legal");
	const e = legalEntityFrom({
		...process.env,
		LEGAL_CONTACT_MAIL: process.env.LEGAL_CONTACT_MAIL || PLATFORM_MAIL,
	});
	const name = legalDisplayName(e);
	return (
		<article className="flex flex-col gap-8 leading-relaxed">
			<div className="flex flex-col gap-2">
				<h1 className="font-serif-display text-3xl">{t("privacy")}</h1>
				<p className="text-muted-foreground text-sm">Stand: {PRIVACY_AS_OF}</p>
			</div>
			<section className="flex flex-col gap-2">
				<h2 className="font-medium text-lg">1. Wer ist verantwortlich?</h2>
				<p>
					Verantwortlich für die Verarbeitung in both.money, soweit wir selbst
					über Zweck und Mittel entscheiden, ist:
				</p>
				<p>
					{name ?? t("incomplete")}
					{e.address.map((line) => (
						<span key={line}>
							<br />
							{line}
						</span>
					))}
					<br />
					{t("email")}:{" "}
					<a
						href={`mailto:${e.contactMail}`}
						className="underline underline-offset-4"
						translate="no"
					>
						{e.contactMail}
					</a>
				</p>
			</section>
			{PRIVACY_SECTIONS.map((s, i) => (
				<section key={s.title} className="flex flex-col gap-2">
					<h2 className="font-medium text-lg">
						{i + 2}. {s.title}
					</h2>
					{s.paragraphs?.map((p) => (
						<p key={p.slice(0, 40)}>{p}</p>
					))}
					{s.items && (
						<ul className="list-disc space-y-1 pl-5">
							{s.items.map((it) => (
								<li key={it.slice(0, 40)}>{it}</li>
							))}
						</ul>
					)}
				</section>
			))}
		</article>
	);
}
