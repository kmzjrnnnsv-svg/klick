import { ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { fmtDate } from "@/lib/compliance/page-data";
import { type DiffLine, diffLines } from "@/lib/documents/diff";
import {
	type CompactLine,
	compactDiff,
	diffStat,
	type VersionTrail,
} from "@/lib/documents/trail";

// Änderungen einer Fassung gegenüber ihrer Vorgängerin: Zähler, wer
// begonnen, bearbeitet, eingereicht und veröffentlicht hat, und die
// geänderten Zeilen (entfernt durchgestrichen, neu hervorgehoben). Ohne
// Skript über <details>; Server-Komponente.

export type TrailVersion = {
	version: string;
	bodyMarkdown: string | null;
	file: { name: string; sha256: string | null } | null;
};

export function DiffView({ lines }: { lines: readonly CompactLine[] }) {
	return (
		<pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-muted p-3 font-mono text-footnote">
			{lines.map((l, i) =>
				l.type === "gap" ? (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: Diff-Zeilen haben keine eigene Identität
						key={`${i}-gap`}
						className="text-muted-foreground"
					>
						{"  …"}
					</div>
				) : (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: Diff-Zeilen haben keine eigene Identität
						key={`${i}-${l.type}`}
						className={
							l.type === "add"
								? "bg-success/15"
								: l.type === "del"
									? "bg-destructive/10 line-through"
									: ""
						}
					>
						{l.type === "add" ? "+ " : l.type === "del" ? "− " : "  "}
						{l.text}
					</div>
				),
			)}
		</pre>
	);
}

export function textDiff(
	before: string | null,
	after: string | null,
): { lines: DiffLine[]; added: number; removed: number } {
	const lines = diffLines(before ?? "", after ?? "");
	return { lines, ...diffStat(lines) };
}

export async function VersionChanges({
	version,
	previous,
	trail,
	names,
}: {
	version: TrailVersion;
	previous: TrailVersion | null;
	trail: VersionTrail | undefined;
	names: ReadonlyMap<string, string>;
}) {
	const t = await getTranslations("Documents");
	const name = (id: string | null) =>
		(id && names.get(id)) || t("trailUnknown");
	const diff = previous
		? textDiff(previous.bodyMarkdown, version.bodyMarkdown)
		: null;
	const compact = diff ? compactDiff(diff.lines, 1) : [];
	const fileChange = previous
		? previous.file?.sha256 !== version.file?.sha256
			? version.file && previous.file
				? t("fileReplaced", {
						before: previous.file.name,
						after: version.file.name,
					})
				: version.file
					? t("fileAdded", { name: version.file.name })
					: previous.file
						? t("fileRemoved")
						: null
			: null
		: null;
	const summary = previous
		? diff && (diff.added > 0 || diff.removed > 0)
			? t("changesVs", {
					version: previous.version,
					added: diff.added,
					removed: diff.removed,
				})
			: t("changesVsNone", { version: previous.version })
		: t("changesFirst");
	const fields = (f: readonly string[]) =>
		f.map((x) => t(`field_${x}` as "field_other")).join(", ");
	return (
		<details className="group text-footnote">
			<summary className="hit-area inline-flex cursor-pointer items-center gap-1 text-primary">
				<ChevronRight
					aria-hidden="true"
					className="size-3.5 transition-transform group-open:rotate-90 motion-reduce:transition-none"
				/>
				{summary}
			</summary>
			<div className="mt-2 flex flex-col gap-2">
				<ul className="flex flex-col gap-0.5 text-muted-foreground">
					{trail?.startedAt && (
						<li>
							{t("trailStarted", {
								name: name(trail.startedBy),
								date: fmtDate.format(trail.startedAt),
							})}
						</li>
					)}
					{trail && trail.editors.length > 0 && (
						<li>
							{t("trailEdited", {
								list: trail.editors
									.map((e) => `${name(e.userId)} (${fields(e.fields)})`)
									.join("; "),
							})}
						</li>
					)}
					{trail?.submittedAt && (
						<li>
							{t("trailSubmitted", {
								name: name(trail.submittedBy),
								date: fmtDate.format(trail.submittedAt),
							})}
						</li>
					)}
					{trail?.publishedAt && (
						<li>
							{t("trailPublished", {
								name: name(trail.publishedBy),
								date: fmtDate.format(trail.publishedAt),
							})}
						</li>
					)}
					{fileChange && <li>{fileChange}</li>}
				</ul>
				{compact.length > 0 && <DiffView lines={compact} />}
			</div>
		</details>
	);
}
