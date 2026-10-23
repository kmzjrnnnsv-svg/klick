import { getTranslations } from "next-intl/server";
import type { ChartNode, ChartWarning } from "@/lib/compliance/org-chart";

// Organigramm als verschachtelte Liste mit Linien (Server-Komponente):
// Spitze oben, darunter je direkt berichtender Funktion ein Ast im Raster,
// Unterstellte eingerückt. Bricht auf schmalen Bildschirmen um statt seitlich
// zu scrollen; die Tabelle darunter bleibt die ausführliche Fassung.

function NodeCard({
	node,
	label,
	vacantLabel,
	deputyLabel,
	top,
}: {
	node: ChartNode;
	label: string;
	vacantLabel: string;
	deputyLabel: (name: string) => string;
	top?: boolean;
}) {
	return (
		<div
			className={`flex min-w-0 flex-col gap-0.5 rounded-md border px-3 py-2 text-xs ${
				node.vacant
					? "border-destructive/50 border-dashed"
					: top
						? "border-primary/40 bg-primary/5"
						: "bg-card"
			}`}
		>
			<span className="font-medium text-foreground text-sm leading-snug">
				{label}
			</span>
			<span
				className={`break-words ${node.vacant ? "text-destructive" : "text-muted-foreground"}`}
			>
				{node.vacant ? vacantLabel : node.holders.join(", ")}
			</span>
			{node.deputies.length > 0 && (
				<span className="text-muted-foreground">
					{deputyLabel(node.deputies.join(", "))}
				</span>
			)}
		</div>
	);
}

export async function OrgChart({
	roots,
	warnings,
	size,
	functionLabels,
}: {
	roots: ChartNode[];
	warnings: ChartWarning[];
	size: number;
	functionLabels: Record<string, string>;
}) {
	const t = await getTranslations("Organisation");
	if (size === 0)
		return (
			<p className="text-muted-foreground text-sm">{t("orgChartEmpty")}</p>
		);
	const label = (f: string) => functionLabels[f] ?? f;
	const card = (node: ChartNode, top?: boolean) => (
		<NodeCard
			node={node}
			label={label(node.function)}
			vacantLabel={t("orgChartVacant")}
			deputyLabel={(name) => t("orgChartDeputy", { name })}
			top={top}
		/>
	);
	const branch = (node: ChartNode) => (
		<>
			{card(node)}
			{node.children.length > 0 && (
				<ul className="mt-2 ml-3 flex flex-col gap-2 border-border border-l pl-3">
					{node.children.map((c) => (
						<li
							key={c.function}
							className="relative before:absolute before:top-4 before:-left-3 before:h-px before:w-3 before:bg-border"
						>
							{branch(c)}
						</li>
					))}
				</ul>
			)}
		</>
	);
	return (
		<div className="flex flex-col gap-3">
			<figure
				aria-label={t("orgChartAria", { count: size })}
				className="m-0 flex flex-col gap-6 rounded-md border bg-background p-4"
			>
				{roots.map((root) => (
					<div key={root.function} className="flex flex-col items-stretch">
						<div className="mx-auto w-full max-w-xs">{card(root, true)}</div>
						{root.children.length > 0 && (
							<>
								<div
									className="mx-auto h-4 w-px bg-border"
									aria-hidden="true"
								/>
								<ul className="grid grid-cols-1 gap-x-3 gap-y-4 border-border border-t pt-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
									{root.children.map((c) => (
										<li
											key={c.function}
											className="relative min-w-0 before:absolute before:-top-4 before:left-4 before:h-4 before:w-px before:bg-border"
										>
											{branch(c)}
										</li>
									))}
								</ul>
							</>
						)}
					</div>
				))}
			</figure>
			{warnings.length > 0 && (
				<ul className="flex list-disc flex-col gap-1 rounded-md border border-warning/40 bg-warning/5 py-2 pr-3 pl-7 text-xs">
					{warnings.map((w) => (
						<li key={`${w.kind}-${"function" in w ? w.function : ""}`}>
							{w.kind === "not_direct"
								? t("warnNotDirect", {
										fn: label(w.function),
										parent: label(w.parent),
										basis: w.basis,
									})
								: w.kind === "cycle"
									? t("warnCycle", { fn: label(w.function) })
									: t("warnNoManagement")}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
