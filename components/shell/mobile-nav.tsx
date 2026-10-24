"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import type { NavGroup } from "@/lib/nav";
import { SidebarNav } from "./sidebar-nav";

export function MobileNav({
	groups,
	orgName,
	canSwitch = false,
}: {
	groups: NavGroup[];
	orgName: string;
	canSwitch?: boolean;
}) {
	const t = useTranslations("Common");
	const to = useTranslations("Organisations");
	const [open, setOpen] = useState(false);
	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="lg:hidden"
					aria-label={t("openMenu")}
				>
					<Menu />
				</Button>
			</SheetTrigger>
			<SheetContent side="left" className="w-80 p-0">
				<SheetHeader className="border-b border-border/60">
					<SheetTitle className="font-bold text-headline">{orgName}</SheetTitle>
					{canSwitch && (
						<Link
							href="/organisationen"
							onClick={() => setOpen(false)}
							className="text-footnote text-primary underline-offset-4 hover:underline"
						>
							{to("switch")}
						</Link>
					)}
				</SheetHeader>
				<div className="overflow-y-auto px-3 py-3">
					<SidebarNav groups={groups} onNavigate={() => setOpen(false)} />
				</div>
			</SheetContent>
		</Sheet>
	);
}
