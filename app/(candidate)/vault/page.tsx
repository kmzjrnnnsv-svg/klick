import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { listVaultItems } from "@/app/actions/vault";
import { auth } from "@/auth";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { UploadZone } from "@/components/vault/upload-zone";
import { VaultList } from "@/components/vault/vault-list";

export default async function VaultPage() {
	const session = await auth();
	if (!session?.user) redirect("/login");

	const t = await getTranslations("Vault");
	const items = await listVaultItems();

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-12 pb-24 sm:px-6 sm:pt-16">
				<header className="mb-8">
					<h1 className="font-semibold text-2xl tracking-tight sm:text-3xl">
						{t("title")}
					</h1>
					<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
						{t("subtitle")}
					</p>
				</header>

				<UploadZone />

				<section className="mt-10 space-y-4">
					<h2 className="font-medium text-sm tracking-tight">
						{t("listHeading")}
					</h2>
					<VaultList items={items} />
				</section>
			</main>
			<Footer />
		</>
	);
}
