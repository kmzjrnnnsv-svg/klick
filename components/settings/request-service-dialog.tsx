"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { requestService } from "@/app/actions/inquiries";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { errorText } from "@/components/ui/error-text";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { INQUIRY_SERVICES, NOTICE_SERVICE } from "@/lib/inquiries/rules";

// „Leistung anfragen“ aus Einstellungen → Abo & Leistungen. Name, E-Mail und
// Organisation kommen aus der Sitzung; die Anfrage trägt Preisgruppe und
// Preis zum Zeitpunkt der Anfrage (Admin → Anfragen).
export function RequestServiceDialog({
	email,
	defaultService = "svc:gap",
	defaultMessage = "",
	triggerLabel = "Leistung anfragen",
	triggerVariant = "default",
}: {
	email: string;
	// Vorbelegung aus „Für dich empfohlen“
	defaultService?: string;
	defaultMessage?: string;
	triggerLabel?: string;
	triggerVariant?: "default" | "outline";
}) {
	const tc = useTranslations("Common");
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [service, setService] = useState<string>(defaultService);
	const [message, setMessage] = useState(defaultMessage);
	const [phone, setPhone] = useState("");
	const [errors, setErrors] = useState<Record<string, string>>({});

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				setOpen(o);
				if (o) {
					setService(defaultService);
					setMessage(defaultMessage);
				}
			}}
		>
			<DialogTrigger asChild>
				<Button type="button" variant={triggerVariant} size="sm">
					{triggerLabel}
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Leistung anfragen</DialogTitle>
					<DialogDescription>
						Wir melden uns per E-Mail an {email} und schlagen einen Termin für
						das Erstgespräch vor.
					</DialogDescription>
				</DialogHeader>
				<form
					id="request-service"
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						start(async () => {
							const res = await requestService({ service, message, phone });
							if (!res.ok) {
								setErrors(
									Object.fromEntries(
										Object.entries(res.fieldErrors ?? {}).map(([k, v]) => [
											k,
											v[0] ?? "",
										]),
									),
								);
								if (!res.fieldErrors) toast.error(errorText(tc, res));
								return;
							}
							toast.success("Anfrage gesendet — wir melden uns per E-Mail.");
							setOpen(false);
							setMessage("");
							setPhone("");
							setErrors({});
						});
					}}
				>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="rs-service">Leistung</Label>
						<Select value={service} onValueChange={setService}>
							<SelectTrigger id="rs-service" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{INQUIRY_SERVICES.filter((s) => s.key !== NOTICE_SERVICE).map(
									(s) => (
										<SelectItem key={s.key} value={s.key}>
											{s.label}
										</SelectItem>
									),
								)}
							</SelectContent>
						</Select>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="rs-message">Was steht an?</Label>
						<Textarea
							id="rs-message"
							name="message"
							value={message}
							onChange={(e) => setMessage(e.target.value)}
							placeholder="z. B. Pentest der Kunden-App vor dem Go-live im März…"
							aria-invalid={errors.message ? true : undefined}
							aria-describedby={errors.message ? "rs-message-error" : undefined}
							className="min-h-28"
						/>
						{errors.message && (
							<p
								id="rs-message-error"
								className="text-destructive text-footnote"
							>
								{errors.message}
							</p>
						)}
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="rs-phone">Telefon (optional)</Label>
						<Input
							id="rs-phone"
							name="phone"
							type="tel"
							autoComplete="tel"
							value={phone}
							onChange={(e) => setPhone(e.target.value)}
						/>
					</div>
				</form>
				<DialogFooter>
					<Button type="submit" form="request-service" disabled={pending}>
						{pending ? "Wird gesendet…" : "Anfrage senden"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
