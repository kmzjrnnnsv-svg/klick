import { notFound } from "next/navigation";
import { getCmsPageBySlug } from "@/app/actions/cms";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";

// Catch-all for editorial CMS pages: /imprint, /privacy, /terms, anything
// the admin published. 404 if no row.
//
// IMPORTANT: This sits in the (marketing) group so it doesn't shadow the
// app's primary routes (/vault, /matches, etc.). The slug enum below
// guards against accidental collisions with route names.

const RESERVED_SLUGS = new Set([
	"vault",
	"profile",
	"matches",
	"requests",
	"jobs",
	"admin",
	"login",
	"post-login",
	"onboarding",
	"api",
	"p",
	"arbeitgeber",
]);

export default async function CmsRenderPage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	if (RESERVED_SLUGS.has(slug)) notFound();
	const page = await getCmsPageBySlug(slug);
	if (!page) notFound();

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-3xl flex-1 px-3 pt-6 pb-20 sm:px-6 sm:pt-12">
				<article className="prose prose-sm max-w-none dark:prose-invert">
					<h1 className="font-semibold text-2xl tracking-tight sm:text-3xl">
						{page.title}
					</h1>
					<div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
						{page.body}
					</div>
				</article>
			</main>
			<Footer />
		</>
	);
}
