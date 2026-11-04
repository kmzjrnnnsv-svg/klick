import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { ChainResult } from "@/lib/bcm/chain";
import { BiaDuration } from "./bia-summary";

// Kette im Notfall am Prozess: je Abhängigkeit Wiederanlauf und Datenverlust
// gegen das Ziel des Prozesses (lib/bcm/chain.ts).
export async function ChainSection({
	chain,
	target,
}: {
	chain: ChainResult;
	target: { rtoHours: number | null; rpoHours: number | null };
}) {
	const t = await getTranslations("Bcm");
	if (chain.rows.length === 0)
		return (
			<p className="text-muted-foreground text-subhead">{t("chainEmpty")}</p>
		);
	const hours = (h: number | null) =>
		h === null ? (
			<span className="text-muted-foreground">{t("chainUnknown")}</span>
		) : (
			<BiaDuration hours={h} />
		);
	const verdict = (ok: boolean | null) =>
		ok === null ? (
			<Badge variant="outline">{t("chainOpen")}</Badge>
		) : ok ? (
			<Badge variant="success">{t("chainOk")}</Badge>
		) : (
			<Badge variant="destructive">{t("chainMiss")}</Badge>
		);
	return (
		<div className="flex flex-col gap-3">
			<dl className="grid grid-cols-1 gap-3 text-subhead sm:grid-cols-2">
				<div>
					<dt className="text-footnote text-muted-foreground">
						{t("chainRto")}
					</dt>
					<dd className="flex flex-wrap items-center gap-2">
						<span className="font-semibold">
							{hours(chain.achievableRtoHours)}
						</span>
						<span className="text-footnote text-muted-foreground">
							{t("chainTarget")}{" "}
							{target.rtoHours === null ? (
								t("chainUnknown")
							) : (
								<BiaDuration hours={target.rtoHours} />
							)}
						</span>
						{verdict(chain.rtoOk)}
					</dd>
				</div>
				<div>
					<dt className="text-footnote text-muted-foreground">
						{t("chainRpo")}
					</dt>
					<dd className="flex flex-wrap items-center gap-2">
						<span className="font-semibold">
							{hours(chain.achievableRpoHours)}
						</span>
						<span className="text-footnote text-muted-foreground">
							{t("chainTarget")}{" "}
							{target.rpoHours === null ? (
								t("chainUnknown")
							) : (
								<BiaDuration hours={target.rpoHours} />
							)}
						</span>
						{verdict(chain.rpoOk)}
					</dd>
				</div>
			</dl>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>{t("chainDependency")}</TableHead>
						<TableHead className="w-28">RTO</TableHead>
						<TableHead className="w-28">RPO</TableHead>
						<TableHead>{t("chainFindings")}</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{chain.rows.map((r) => (
						<TableRow key={`${r.kind}:${r.id}`}>
							<TableCell>
								<Link
									href={
										r.kind === "asset" ? "/assets" : `/dienstleister/${r.id}`
									}
									className="hover:underline"
								>
									{r.name}
								</Link>
								<p className="text-footnote text-muted-foreground">
									{t(`chainKind_${r.kind}`)}
									{r.kind === "asset" && r.redundancy
										? ` · ${t(`redundancy_${r.redundancy}`)}`
										: ""}
								</p>
							</TableCell>
							<TableCell className="tabular-nums">
								{hours(r.rtoHours)}
							</TableCell>
							<TableCell className="tabular-nums">
								{hours(r.rpoHours)}
							</TableCell>
							<TableCell>
								{r.issues.length === 0 ? (
									<span className="text-footnote text-muted-foreground">
										{t("chainNoFinding")}
									</span>
								) : (
									<ul className="flex flex-wrap gap-1">
										{r.issues.map((i) => (
											<li key={i}>
												<Badge
													variant={
														i === "rto_slow" || i === "rpo_loss"
															? "destructive"
															: "warning"
													}
												>
													{t(`chain_${i}`)}
												</Badge>
											</li>
										))}
									</ul>
								)}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
