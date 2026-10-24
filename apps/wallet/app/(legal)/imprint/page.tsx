import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
	legalDisplayName,
	legalEntityFrom,
	legalRepresentatives,
} from "@/lib/legal/entity";
import { PLATFORM_MAIL } from "@/lib/mail/address";

export const metadata: Metadata = { title: "Impressum" };
export const dynamic = "force-dynamic";

// Anbieterkennzeichnung (§ 5 DDG) aus denselben LEGAL_*-Werten wie Klick
export default async function ImprintPage() {
	const t = await getTranslations("Legal");
	const e = legalEntityFrom({
		...process.env,
		LEGAL_CONTACT_MAIL: process.env.LEGAL_CONTACT_MAIL || PLATFORM_MAIL,
	});
	const name = legalDisplayName(e);
	const reps = legalRepresentatives(e);
	return (
		<article className="flex flex-col gap-6 leading-relaxed">
			<h1 className="font-bold text-title-1">{t("imprint")}</h1>
			<section className="flex flex-col gap-2">
				<h2 className="font-medium">{t("provider")}</h2>
				{name ? (
					<p>
						{name}
						{e.address.map((line) => (
							<span key={line}>
								<br />
								{line}
							</span>
						))}
					</p>
				) : (
					<p className="text-muted-foreground">{t("incomplete")}</p>
				)}
				{reps && (
					<p>
						{t("representedBy")}: {reps}
					</p>
				)}
				{e.register && (
					<p>
						{t("register")}: {e.register}
					</p>
				)}
				{e.vatId && (
					<p>
						{t("vatId")}: <span translate="no">{e.vatId}</span>
					</p>
				)}
			</section>
			<section className="flex flex-col gap-2">
				<h2 className="font-medium">{t("contact")}</h2>
				<p>
					{t("email")}:{" "}
					<a
						href={`mailto:${e.contactMail}`}
						className="underline underline-offset-4"
						translate="no"
					>
						{e.contactMail}
					</a>
					{e.phone && (
						<>
							<br />
							{t("phone")}: {e.phone}
						</>
					)}
				</p>
			</section>
			<p className="text-muted-foreground text-subhead">{t("audience")}</p>
		</article>
	);
}
