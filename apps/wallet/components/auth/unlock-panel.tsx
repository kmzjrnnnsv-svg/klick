"use client";

import { useRouter } from "next/navigation";
import { PasskeyConfirmButton } from "./passkey-confirm";

export function UnlockPanel({ next }: { next: string }) {
	const router = useRouter();
	return (
		<PasskeyConfirmButton
			purpose="unlock"
			onConfirmed={() => {
				router.replace(next);
				router.refresh();
			}}
		/>
	);
}
