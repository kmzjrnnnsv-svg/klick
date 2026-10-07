import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { EntityKind } from "@/db/schema/enums";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { type SearchHit, searchOrg } from "@/lib/compliance/search";
import { readOrg } from "@/lib/db/with-org";
import { entityHref } from "@/lib/entities/links";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function hrefFor(h: SearchHit): string {
	switch (h.kind) {
		case "control":
			return `/controls/${h.code ?? ""}`;
		case "risk":
			return `/risiken/${h.id}`;
		case "document":
			return `/dokumente/${encodeURIComponent(h.code ?? "")}`;
		case "process":
			return `/prozesse/${encodeURIComponent(h.code ?? "")}`;
		case "provider":
			return "/dienstleister";
		case "asset":
			return "/assets";
		case "incident":
			return `/vorfaelle/${h.id}`;
		case "nonconformity":
			return `/abweichungen/${h.id}`;
		case "task":
			return h.entityType && h.entityId
				? entityHref(h.entityType as EntityKind, h.entityId, h.title)
				: "/heute/aufgaben";
		case "comment":
			return h.entityType && h.entityId
				? entityHref(h.entityType as EntityKind, h.entityId)
				: "/aktivitaet";
	}
}

// /suche — Ergebnisseite der Volltextsuche (⌘K öffnet sie mit der Eingabe).
export default async function SearchPage({
	searchParams,
}: {
	searchParams: Promise<Search>;
}) {
	const ctx = await requireOrg();
	const sp = await searchParams;
	const q = (one(sp.q) ?? "").trim();
	const t = await getTranslations("Search");
	const hits =
		q.length >= 2
			? await readOrg(toOrgCtx(ctx), (tx) => searchOrg(tx, ctx.orgId, q))
			: [];
	const groups = new Map<SearchHit["kind"], SearchHit[]>();
	for (const h of hits) {
		const list = groups.get(h.kind) ?? [];
		list.push(h);
		groups.set(h.kind, list);
	}
	return (
		<>
			<PageHeader title={t("title")} lead={t("lead")} />
			<form method="get" action="/suche" className="mb-6 flex max-w-xl gap-2">
				<Input
					name="q"
					defaultValue={q}
					placeholder={t("placeholder")}
					aria-label={t("title")}
					autoFocus
				/>
			</form>
			{q.length < 2 ? (
				<p className="text-muted-foreground text-sm">{t("hint")}</p>
			) : hits.length === 0 ? (
				<p className="text-sm">{t("none", { q })}</p>
			) : (
				<div className="flex flex-col gap-6">
					<p className="text-muted-foreground text-sm">
						{t("count", { n: hits.length, q })}
					</p>
					{[...groups.entries()].map(([kind, list]) => (
						<section key={kind}>
							<h2 className="lv-eyebrow mb-2 text-[0.6rem] text-muted-foreground">
								{t(`kind_${kind}`)} · {list.length}
							</h2>
							<ul className="flex flex-col divide-y divide-border/60 rounded-md border text-sm">
								{list.map((h) => (
									<li key={`${h.kind}-${h.id}`} className="px-3 py-2">
										<Link
											href={hrefFor(h)}
											className="flex flex-wrap items-baseline gap-2 hover:underline underline-offset-4"
										>
											{h.code && (
												<Badge
													variant="outline"
													className="font-mono normal-case tracking-normal"
												>
													{h.code}
												</Badge>
											)}
											<span className="font-medium">{h.title}</span>
										</Link>
										{h.snippet && (
											<p className="mt-0.5 line-clamp-2 text-muted-foreground text-xs">
												{h.snippet}
											</p>
										)}
									</li>
								))}
							</ul>
						</section>
					))}
				</div>
			)}
		</>
	);
}
