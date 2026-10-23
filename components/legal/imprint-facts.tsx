import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { legalDisplayName } from "@/lib/legal/entity";
import { legalEntity } from "@/lib/legal/entity-env";

// Pflichtangaben nach § 5 DDG aus der Env (LEGAL_*), über dem CMS-Text des
// Impressums. Ohne Firmenname bleibt der Block weg (dann trägt der CMS-Text
// die Angaben); die Kontaktzeile mit dem Formular steht immer da.
export async function ImprintFacts() {
	const t = await getTranslations("Legal");
	const e = legalEntity();
	const name = legalDisplayName(e);
	return (
		<section aria-label={t("imprintFacts")} className="mt-8 space-y-5">
			{name && (
				<>
					<div>
						<h2 className="font-medium text-base">{t("imprintFacts")}</h2>
						<p className="mt-2 leading-relaxed">
							{name}
							{e.address.map((line) => (
								<span key={line}>
									<br />
									{line}
								</span>
							))}
						</p>
					</div>
					{e.representatives && (
						<p>
							{t("representedBy")}: {e.representatives}
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
				</>
			)}
			<div>
				<h2 className="font-medium text-base">{t("contact")}</h2>
				<p className="mt-2 leading-relaxed">
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
				<p className="mt-2 text-muted-foreground text-sm">
					<Link
						href="/leistungen#anfrage"
						className="underline underline-offset-4"
					>
						{t("contactForm")}
					</Link>
				</p>
			</div>
		</section>
	);
}
