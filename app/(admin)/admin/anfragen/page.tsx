import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { InquiryActions } from "@/components/admin/inquiry-actions";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { INQUIRY_STATUS, type InquiryStatus } from "@/db/schema/enums";
import { requirePlatformAdminPage } from "@/lib/auth/gates";
import { getInquiry, inquiryCounts, listInquiries } from "@/lib/db/inquiries";
import {
	INQUIRY_STATUS_LABEL,
	inquiryServiceLabel,
} from "@/lib/inquiries/rules";
import { cn } from "@/lib/utils";

const isStatus = (s: string | undefined): s is InquiryStatus =>
	(INQUIRY_STATUS as readonly string[]).includes(s ?? "");

// Anfragen aus dem Formular auf /leistungen und aus der App. Löschung
// automatisch 12 Monate nach der letzten Änderung (Job retention).
export default async function AdminInquiriesPage({
	searchParams,
}: {
	searchParams: Promise<{ status?: string; id?: string }>;
}) {
	await requirePlatformAdminPage();
	const t = await getTranslations("Admin");
	const sp = await searchParams;
	const status =
		sp.status === "alle" ? undefined : isStatus(sp.status) ? sp.status : "new";
	const [rows, counts, selected] = await Promise.all([
		listInquiries(status),
		inquiryCounts(),
		sp.id && /^[0-9a-f-]{36}$/.test(sp.id) ? getInquiry(sp.id) : null,
	]);
	const fmt = new Intl.DateTimeFormat("de-DE", {
		dateStyle: "medium",
		timeStyle: "short",
		timeZone: "Europe/Berlin",
	});
	const href = (next: Record<string, string | undefined>) => {
		const p = new URLSearchParams();
		const merged = { status: sp.status, id: sp.id, ...next };
		for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
		const qs = p.toString();
		return `/admin/anfragen${qs ? `?${qs}` : ""}`;
	};
	const filters: { key: string; label: string; n?: number }[] = [
		...INQUIRY_STATUS.map((s) => ({
			key: s,
			label: INQUIRY_STATUS_LABEL[s],
			n: counts.get(s) ?? 0,
		})),
		{ key: "alle", label: "Alle" },
	];
	const active = sp.status === "alle" ? "alle" : (status ?? "new");

	return (
		<>
			<h1 className="mb-2 font-bold text-title-1">{t("inquiries")}</h1>
			<p className="mb-6 max-w-3xl text-muted-foreground text-subhead">
				{t("inquiriesLead")}
			</p>
			<nav
				aria-label="Status"
				className="mb-6 flex flex-wrap gap-x-5 gap-y-2 text-subhead"
			>
				{filters.map((f) => (
					<Link
						key={f.key}
						href={href({ status: f.key, id: undefined })}
						aria-current={active === f.key ? "page" : undefined}
						className={cn(
							"underline-offset-4 hover:underline",
							active === f.key
								? "font-medium text-foreground underline"
								: "text-muted-foreground",
						)}
					>
						{f.label}
						{f.n !== undefined && (
							<span className="ml-1 tabular-nums">({f.n})</span>
						)}
					</Link>
				))}
			</nav>
			<div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Eingang</TableHead>
							<TableHead>Leistung</TableHead>
							<TableHead>Von</TableHead>
							<TableHead>Status</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((r) => (
							<TableRow
								key={r.id}
								className={cn(selected?.id === r.id && "bg-muted/60")}
							>
								<TableCell className="whitespace-nowrap text-muted-foreground text-footnote tabular-nums">
									{fmt.format(r.createdAt)}
								</TableCell>
								<TableCell>
									<Link
										href={href({ id: r.id })}
										className="font-medium hover:underline"
									>
										{inquiryServiceLabel(r.serviceKey)}
									</Link>
								</TableCell>
								<TableCell className="min-w-0 break-words">
									{r.name}
									{r.company && (
										<span className="text-muted-foreground">
											{" "}
											· {r.company}
										</span>
									)}
									{r.source === "app" && (
										<Badge variant="muted" className="ml-2">
											App
										</Badge>
									)}
								</TableCell>
								<TableCell className="text-subhead">
									{INQUIRY_STATUS_LABEL[r.status]}
								</TableCell>
							</TableRow>
						))}
						{rows.length === 0 && (
							<TableRow>
								<TableCell colSpan={4} className="text-muted-foreground">
									Keine Anfragen in diesem Status.
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
				{selected ? (
					<section
						aria-labelledby="inq-detail"
						className="flex min-w-0 flex-col gap-4 rounded-2xl bg-card p-5"
					>
						<div>
							<h2 id="inq-detail" className="font-bold text-title-2">
								{inquiryServiceLabel(selected.serviceKey)}
							</h2>
							<p className="text-muted-foreground text-footnote">
								{fmt.format(selected.createdAt)} ·{" "}
								{selected.source === "app" ? "aus der App" : "Website"} ·{" "}
								{INQUIRY_STATUS_LABEL[selected.status]}
							</p>
						</div>
						<dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-subhead">
							<dt className="text-muted-foreground">Name</dt>
							<dd className="break-words">{selected.name}</dd>
							<dt className="text-muted-foreground">Firma</dt>
							<dd className="break-words">{selected.company ?? "—"}</dd>
							<dt className="text-muted-foreground">E-Mail</dt>
							<dd className="break-all">
								<a
									href={`mailto:${selected.email}?subject=${encodeURIComponent(`Deine Anfrage: ${inquiryServiceLabel(selected.serviceKey)}`)}`}
									className="underline underline-offset-4"
								>
									{selected.email}
								</a>
							</dd>
							{selected.phone && (
								<>
									<dt className="text-muted-foreground">Telefon</dt>
									<dd>{selected.phone}</dd>
								</>
							)}
							{selected.context.orgName && (
								<>
									<dt className="text-muted-foreground">Organisation</dt>
									<dd className="break-words">{selected.context.orgName}</dd>
								</>
							)}
							{selected.source === "app" && (
								<>
									<dt className="text-muted-foreground">Preisgruppe</dt>
									<dd>{selected.context.priceGroup ?? "Standard"}</dd>
									<dt className="text-muted-foreground">Preis damals</dt>
									<dd>{selected.context.price ?? "—"}</dd>
								</>
							)}
						</dl>
						<p className="whitespace-pre-wrap break-words rounded-md bg-muted p-4 text-subhead">
							{selected.message}
						</p>
						<InquiryActions id={selected.id} status={selected.status} />
					</section>
				) : (
					<p className="text-muted-foreground text-subhead">
						Wähle eine Anfrage, um sie zu lesen.
					</p>
				)}
			</div>
		</>
	);
}
