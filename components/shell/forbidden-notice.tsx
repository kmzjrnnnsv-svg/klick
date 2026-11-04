"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "@/components/ui/toast";

// Nach einer Umleitung ohne Recht (`?grund=kein-recht`, redirectFor in
// lib/auth/gates.ts) einmal sagen, warum, statt still auf der Startseite zu
// landen; danach verschwindet der Parameter aus der Adresse.
export function ForbiddenNotice({ message }: { message: string }) {
	const params = useSearchParams();
	const pathname = usePathname();
	const router = useRouter();
	const shown = useRef(false);
	useEffect(() => {
		if (params.get("grund") !== "kein-recht" || shown.current) return;
		shown.current = true;
		toast.notice(message);
		const next = new URLSearchParams(params.toString());
		next.delete("grund");
		const q = next.toString();
		router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
	}, [params, pathname, router, message]);
	return null;
}
