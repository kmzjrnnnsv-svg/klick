import type { ReactNode } from "react";
import { Footer } from "@/components/shell/footer";
import { MarketingHeader } from "@/components/shell/marketing-header";

export default function MarketingLayout({ children }: { children: ReactNode }) {
	return (
		<>
			<MarketingHeader />
			{children}
			<Footer />
		</>
	);
}
