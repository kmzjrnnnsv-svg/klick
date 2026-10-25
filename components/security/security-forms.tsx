"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import {
	acceptFinding,
	importScanFile,
	startQuickCheck,
} from "@/app/actions/security-checks";
import {
	DlpWarning,
	useUploadFeedback,
} from "@/components/entity/upload-feedback";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

type ProductOption = { id: string; code: string; name: string };

function ProductSelect({
	id,
	value,
	onChange,
	products,
}: {
	id: string;
	value: string;
	onChange: (v: string) => void;
	products: ProductOption[];
}) {
	const t = useTranslations("Security");
	return (
		<div className="flex flex-col gap-1.5">
			<Label htmlFor={id}>{t("product")}</Label>
			<Select
				value={value || "none"}
				onValueChange={(v) => onChange(v === "none" ? "" : v)}
			>
				<SelectTrigger id={id} className="w-full">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="none">{t("noProduct")}</SelectItem>
					{products.map((p) => (
						<SelectItem key={p.id} value={p.id}>
							{p.code} {p.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

const SCAN_ERRORS = new Set([
	"scan_invalid_json",
	"scan_unknown_format",
	"scan_too_many",
]);

// Scan-Datei importieren (SARIF, Trivy, ZAP, OSV, Nuclei, gitleaks) — global
// oder in einen Sicherheitsauftrag (dann ohne Vollscan-Abgleich).
export function ScanImportDialog({
	products,
	engagementId,
}: {
	products: ProductOption[];
	engagementId?: string;
}) {
	const t = useTranslations("Security");
	const tc = useTranslations("Common");
	const router = useRouter();
	const { errorText, dlpWarning, tooLarge } = useUploadFeedback();
	const input = useRef<HTMLInputElement>(null);
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [productId, setProductId] = useState("");
	const [fullScan, setFullScan] = useState(true);
	const [warn, setWarn] = useState<string[] | null>(null);
	const [ack, setAck] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm" variant={engagementId ? "outline" : "default"}>
					<Upload aria-hidden="true" />
					{t("import")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						const file = input.current?.files?.[0];
						if (!file) return;
						const big = tooLarge(file);
						if (big) return void toast.error(big);
						start(async () => {
							const fd = new FormData();
							fd.set("file", file);
							if (productId) fd.set("productId", productId);
							if (engagementId) fd.set("engagementId", engagementId);
							else if (fullScan) fd.set("fullScan", "1");
							if (ack) fd.set("dlpAcknowledged", "1");
							const res = await importScanFile(fd);
							if (!res.ok) {
								const w = dlpWarning(res);
								if (w) return void setWarn(w);
								const text = SCAN_ERRORS.has(res.error)
									? t(res.error as "scan_invalid_json")
									: errorText(res);
								setMessage(text);
								return void toast.error(text);
							}
							toast.success(
								t("imported", {
									findings: res.data.findings,
									created: res.data.created,
								}),
							);
							setOpen(false);
							setWarn(null);
							setAck(false);
							setMessage(null);
							if (engagementId) router.refresh();
							else router.push("/sicherheit?tab=befunde");
						});
					}}
				>
					<DialogHeader>
						<DialogTitle>{t("importTitle")}</DialogTitle>
						<DialogDescription>{t("importLead")}</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="scan-file">{t("file")}</Label>
						<Input
							id="scan-file"
							ref={input}
							type="file"
							accept=".json,.sarif,.jsonl"
							required
						/>
					</div>
					{products.length > 0 && !engagementId && (
						<ProductSelect
							id="scan-product"
							value={productId}
							onChange={setProductId}
							products={products}
						/>
					)}
					{!engagementId && (
						<label className="flex items-start gap-2 text-subhead">
							<Checkbox
								checked={fullScan}
								onCheckedChange={(v) => setFullScan(Boolean(v))}
								className="mt-0.5"
							/>
							<span>
								{t("fullScan")}
								<span className="block text-muted-foreground text-footnote">
									{t("fullScanHint")}
								</span>
							</span>
						</label>
					)}
					{warn && (
						<DlpWarning
							reasons={warn}
							acknowledged={ack}
							onAcknowledge={setAck}
						/>
					)}
					<p aria-live="polite" className="text-destructive text-footnote">
						{message}
					</p>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setOpen(false)}
						>
							{tc("cancel")}
						</Button>
						<Button type="submit" disabled={pending || (warn !== null && !ack)}>
							{pending ? tc("working") : t("import")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

const TARGET_ERRORS = new Set([
	"target_invalid_url",
	"target_protocol",
	"target_credentials",
	"target_port",
	"target_host",
	"target_blocked_address",
	"quota",
]);

// Passiver Schnellcheck: nur eigene oder beauftragte Ziele (bestätigt).
export function QuickCheckForm({
	products,
	remaining,
}: {
	products: ProductOption[];
	remaining: number;
}) {
	const t = useTranslations("Security");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [url, setUrl] = useState("");
	const [productId, setProductId] = useState("");
	const [confirmed, setConfirmed] = useState(false);
	const [error, setError] = useState<string | null>(null);
	return (
		<form
			className="flex max-w-xl flex-col gap-4 text-subhead"
			onSubmit={(e) => {
				e.preventDefault();
				setError(null);
				start(async () => {
					const res = await startQuickCheck({
						url: /^https?:\/\//i.test(url) ? url : `https://${url}`,
						productId: productId || null,
						confirmed: true as const,
					});
					if (!res.ok) {
						const text = TARGET_ERRORS.has(res.error)
							? t(res.error as "quota")
							: errorText(tc, res);
						setError(text);
						return void toast.error(text);
					}
					toast.success(t("quickStarted"));
					setUrl("");
					setConfirmed(false);
					router.refresh();
				});
			}}
		>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="qc-url">{t("quickUrl")}</Label>
				<Input
					id="qc-url"
					type="url"
					inputMode="url"
					placeholder="https://app.example.com…"
					value={url}
					onChange={(e) => setUrl(e.target.value)}
					required
					autoComplete="off"
					spellCheck={false}
					aria-describedby="qc-url-error"
				/>
				<p
					id="qc-url-error"
					aria-live="polite"
					className="text-destructive text-footnote"
				>
					{error}
				</p>
			</div>
			{products.length > 0 && (
				<ProductSelect
					id="qc-product"
					value={productId}
					onChange={setProductId}
					products={products}
				/>
			)}
			<label className="flex items-start gap-2">
				<Checkbox
					checked={confirmed}
					onCheckedChange={(v) => setConfirmed(Boolean(v))}
					className="mt-0.5"
				/>
				<span>{t("quickConfirm")}</span>
			</label>
			<div className="flex items-center justify-between gap-2">
				<span className="text-muted-foreground text-footnote">
					{t("quickRemaining", { n: remaining })}
				</span>
				<Button
					type="submit"
					disabled={pending || !confirmed || !url.trim() || remaining <= 0}
				>
					{pending ? tc("working") : t("quickStart")}
				</Button>
			</div>
		</form>
	);
}

// Solange ein Schnellcheck läuft, die Seite alle 5 s neu laden (max. 3 min).
export function RefreshWhileRunning({ running }: { running: boolean }) {
	const router = useRouter();
	useEffect(() => {
		if (!running) return;
		let n = 0;
		const id = setInterval(() => {
			n += 1;
			if (n > 36) clearInterval(id);
			router.refresh();
		}, 5000);
		return () => clearInterval(id);
	}, [running, router]);
	return null;
}

// Akzeptieren = bewusste Risikoentscheidung mit Begründung und Ablauf.
export function AcceptFindingDialog({ findingId }: { findingId: string }) {
	const t = useTranslations("Security");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [note, setNote] = useState("");
	const inThreeMonths = new Date(Date.now() + 90 * 86_400_000)
		.toISOString()
		.slice(0, 10);
	const [until, setUntil] = useState(inThreeMonths);
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm" variant="outline">
					{t("accept")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						start(async () => {
							const res = await acceptFinding({
								findingId,
								note,
								acceptedUntil: until,
							});
							if (!res.ok)
								return void toast.error(
									res.error === "acceptedUntil_range"
										? t("acceptRange")
										: errorText(tc, res),
								);
							toast.success(t("accepted"));
							setOpen(false);
							router.refresh();
						});
					}}
				>
					<DialogHeader>
						<DialogTitle>{t("acceptTitle")}</DialogTitle>
						<DialogDescription>{t("acceptLead")}</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="acc-note">{t("acceptNote")}</Label>
						<Textarea
							id="acc-note"
							rows={3}
							value={note}
							onChange={(e) => setNote(e.target.value)}
							minLength={10}
							required
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="acc-until">{t("acceptUntil")}</Label>
						<Input
							id="acc-until"
							type="date"
							value={until}
							onChange={(e) => setUntil(e.target.value)}
							required
						/>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setOpen(false)}
						>
							{tc("cancel")}
						</Button>
						<Button type="submit" disabled={pending || note.trim().length < 10}>
							{pending ? tc("working") : t("accept")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
