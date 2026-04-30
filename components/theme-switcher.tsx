"use client";

import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function ThemeSwitcher() {
	const { resolvedTheme, setTheme } = useTheme();
	const [mounted, setMounted] = useState(false);
	const t = useTranslations("Header");

	useEffect(() => setMounted(true), []);

	const next = resolvedTheme === "dark" ? "light" : "dark";

	return (
		<Button
			variant="ghost"
			size="icon"
			aria-label={t("toggleTheme")}
			onClick={() => setTheme(next)}
		>
			{mounted && resolvedTheme === "dark" ? (
				<Sun className="h-4 w-4" strokeWidth={1.5} />
			) : (
				<Moon className="h-4 w-4" strokeWidth={1.5} />
			)}
		</Button>
	);
}
