import { ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { RevealWithStepUp } from "@/components/entity/reveal-with-step-up";
import { fmtDate } from "@/lib/compliance/page-data";
import {
	type ContentDiff,
	type ContentSide,
	contentDiff,
} from "@/lib/documents/content-diff";
import type { DisplayLine, VersionTrail } from "@/lib/documents/trail";

// Änderungen einer Fassung gegenüber ihrer Vorgängerin: Zähler, wer
// begonnen, bearbeitet, eingereicht und veröffentlicht hat, und die
// geänderten Zeilen von Text und Dateiinhalt (entfernt durchgestrichen, neu
// hervorgehoben, geänderte Absätze Wort für Wort). Ohne Skript über
// <details>; Server-Komponente. Umbrochene Zeilen hängen unter dem Text,
// nicht unter dem Zeichen am Zeilenanfang.
const LINE = "ps-[2ch] -indent-[2ch]";

export type TrailVersion = ContentSide & { version: string };

export function DiffView({ lines }: { lines: readonly DisplayLine[] }) {
	return (
		<pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-muted p-3 font-mono text-footnote">
			{lines.map((l, i) =>
				l.type === "gap" ? (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: Diff-Zeilen haben keine eigene Identität
						key={`${i}-gap`}
						className={`${LINE} text-muted-foreground`}
					>
						{"  …"}
					</div>
				) : l.type === "change" ? (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: Diff-Zeilen haben keine eigene Identität
						key={`${i}-change`}
						className={LINE}
					>
						{"± "}
						{l.parts.map((p, k) =>
							p.type === "del" ? (
								<del
									// biome-ignore lint/suspicious/noArrayIndexKey: Wortteile haben keine eigene Identität
									key={k}
									className="bg-destructive/10"
								>
									{p.text}
								</del>
							) : p.type === "add" ? (
								<ins
									// biome-ignore lint/suspicious/noArrayIndexKey: Wortteile haben keine eigene Identität
									key={k}
									className={`bg-success/15 no-underline ${l.parts[k - 1]?.type === "del" ? "ms-1" : ""}`}
								>
									{p.text}
								</ins>
							) : (
								// biome-ignore lint/suspicious/noArrayIndexKey: Wortteile haben keine eigene Identität
								<span key={k}>{p.text}</span>
							),
						)}
					</div>
				) : (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: Diff-Zeilen haben keine eigene Identität
						key={`${i}-${l.type}`}
						className={`${LINE} ${
							l.type === "add"
								? "bg-success/15"
								: l.type === "del"
									? "bg-destructive/10 line-through"
									: ""
						}`}
					>
						{l.type === "add" ? "+ " : l.type === "del" ? "− " : "  "}
						{l.text}
					</div>
				),
			)}
		</pre>
	);
}

// Text in Klick und Inhalt der Datei je als eigener Block; Überschriften nur,
// wenn es beide gibt bzw. die Datei ersetzt wurde
export async function ContentChanges({ diff }: { diff: ContentDiff }) {
	const t = await getTranslations("Documents");
	const file = diff.file.kind === "replaced" ? diff.file : null;
	if (!diff.text && !file) return null;
	const hint = file?.hint
		? {
				locked: t("fileTextLocked"),
				pending: t("fileTextPending"),
				no_text: t("fileTextNoText"),
				encrypted: t("fileTextEncrypted"),
				error: t("fileTextError"),
			}[file.hint]
		: null;
	const shown = Boolean(diff.text || file?.diff);
	return (
		<div className="flex flex-col gap-2">
			{diff.text && (
				<div className="flex flex-col gap-1">
					{file && <p className="font-medium text-footnote">{t("diffText")}</p>}
					<DiffView lines={diff.text.lines} />
				</div>
			)}
			{file && (
				<div className="flex flex-col gap-1">
					<p className="font-medium text-footnote">{t("diffFile")}</p>
					{file.diff ? (
						<DiffView lines={file.diff.lines} />
					) : (
						<p className="text-muted-foreground text-footnote">
							{hint ?? t("fileTextSame")}
						</p>
					)}
					{file.hint === "locked" && (
						<div>
							<RevealWithStepUp />
						</div>
					)}
					{file.truncated && (
						<p className="text-muted-foreground text-footnote">
							{t("fileTextTruncated")}
						</p>
					)}
				</div>
			)}
			{shown && (
				<p className="text-muted-foreground text-footnote">{t("diffLegend")}</p>
			)}
		</div>
	);
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
	const diff = previous ? contentDiff(previous, version) : null;
	const fileChange =
		diff?.file.kind === "replaced"
			? t("fileReplaced", { before: diff.file.before, after: diff.file.after })
			: diff?.file.kind === "added"
				? t("fileAdded", { name: diff.file.name })
				: diff?.file.kind === "removed"
					? t("fileRemoved")
					: null;
	const summary =
		previous && diff
			? diff.added > 0 || diff.removed > 0
				? t("changesVs", {
						version: previous.version,
						added: diff.added,
						removed: diff.removed,
					})
				: diff.file.kind !== "none"
					? t("changesVsFile", { version: previous.version })
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
				{diff && <ContentChanges diff={diff} />}
			</div>
		</details>
	);
}
