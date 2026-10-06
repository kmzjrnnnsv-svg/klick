"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { verifyAuditChainAction } from "@/app/actions/admin";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function VerifyChainButton() {
	const t = useTranslations("Admin");
	const [pending, start] = useTransition();
	const [result, setResult] = useState<{
		checked: number;
		broken: string[];
	} | null>(null);
	return (
		<div className="flex flex-col gap-3">
			<Button
				variant="outline"
				size="sm"
				disabled={pending}
				onClick={() =>
					start(async () => {
						const res = await verifyAuditChainAction();
						if (res.ok) setResult(res.data);
					})
				}
			>
				{t("verifyChain")}
			</Button>
			{result && (
				<Alert variant={result.broken.length === 0 ? "success" : "destructive"}>
					<AlertDescription>
						{result.broken.length === 0
							? t("chainOk", { count: result.checked })
							: `${t("chainBroken", { seq: "?", reason: result.broken.join(", ") })}`}
					</AlertDescription>
				</Alert>
			)}
		</div>
	);
}
