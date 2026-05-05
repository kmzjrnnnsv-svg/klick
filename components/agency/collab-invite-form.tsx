"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { inviteCollaboration } from "@/app/actions/collabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CollabInviteForm({ jobId }: { jobId: string }) {
	const [email, setEmail] = useState("");
	const [leadPct, setLeadPct] = useState("70");
	const [partnerPct, setPartnerPct] = useState("30");
	const [scope, setScope] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [sentEmail, setSentEmail] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();

	function submit() {
		setError(null);
		const lead = Number(leadPct);
		const partner = Number(partnerPct);
		if (lead + partner !== 100) {
			setError("Lead + Partner müssen zusammen 100% ergeben.");
			return;
		}
		startTransition(async () => {
			try {
				await inviteCollaboration({
					jobId,
					partnerEmail: email,
					leadCommissionPct: lead,
					partnerCommissionPct: partner,
					scope: scope || undefined,
				});
				setSentEmail(email);
				setEmail("");
				setScope("");
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			}
		});
	}

	return (
		<div className="space-y-3">
			<div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
				<Input
					type="email"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					placeholder="partner@andere-agency.de"
				/>
				<Input
					type="number"
					min={0}
					max={100}
					value={leadPct}
					onChange={(e) => setLeadPct(e.target.value)}
					placeholder="Lead %"
					className="w-20"
				/>
				<Input
					type="number"
					min={0}
					max={100}
					value={partnerPct}
					onChange={(e) => setPartnerPct(e.target.value)}
					placeholder="Partner %"
					className="w-20"
				/>
			</div>
			<textarea
				value={scope}
				onChange={(e) => setScope(e.target.value)}
				rows={2}
				placeholder="Notiz / Vertragstext (optional)"
				className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
			/>
			<Button onClick={submit} disabled={isPending || !email}>
				{isPending ? (
					<Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} />
				) : null}
				{isPending ? "Sende…" : "Partner einladen"}
			</Button>
			{sentEmail && (
				<p className="text-emerald-700 text-xs dark:text-emerald-300">
					Anfrage an {sentEmail} versendet.
				</p>
			)}
			{error && (
				<p className="text-rose-700 text-xs dark:text-rose-300">{error}</p>
			)}
		</div>
	);
}
