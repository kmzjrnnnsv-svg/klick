import type { ReactNode } from "react";
import { Footer } from "@/components/shell/footer";
import { MarketingHeader } from "@/components/shell/marketing-header";

// Auth-Seiten lesen die Sitzung je Request (Gates, 2FA-Stand) — nie statisch
// vorrendern, wie (app) und (admin).
export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: ReactNode }) {
	return (
		<>
			<MarketingHeader showLogin={false} />
			<main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12 sm:px-6">
				{children}
			</main>
			<Footer />
		</>
	);
}
