import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { OrgRole, RolePermissions } from "@/lib/auth/permissions";
import { allows } from "@/lib/auth/permissions";
import { NAV_SECTIONS, type NavSectionGroup } from "@/lib/nav";
import { cn } from "@/lib/utils";

// Umschalter zwischen Seiten, die sich einen Eintrag in der Seitenleiste
// teilen (NAV_SECTIONS in lib/nav.ts) — segmentierte Steuerung nach Apple HIG
// oben auf der Seite, als Links (teilbar, ohne Client-State). Abschnitte ohne
// Recht oder für Rollen, denen die Navigation sie nicht zeigt, fehlen; bleibt
// nur einer, entfällt der Umschalter.
export async function SectionSwitch({
	group,
	current,
	ctx,
}: {
	group: NavSectionGroup;
	// href der Seite, die gerade offen ist
	current: string;
	ctx: { orgRole: OrgRole; permissions: RolePermissions };
}) {
	const t = await getTranslations("Nav");
	const items = NAV_SECTIONS[group].filter(
		(s) =>
			!s.hideFor?.includes(ctx.orgRole) && (!s.perm || allows(ctx, s.perm)),
	);
	if (items.length < 2) return null;
	return (
		<nav
			aria-label={t("sectionSwitch")}
			className="mb-4 flex w-fit max-w-full gap-0.5 overflow-x-auto rounded-[0.5625rem] bg-muted p-0.5 [scrollbar-width:none]"
		>
			{items.map((s) => {
				const on = s.href === current;
				return (
					<Link
						key={s.key}
						href={s.href}
						aria-current={on ? "page" : undefined}
						className={cn(
							"inline-flex h-(--control-h-sm) flex-1 shrink-0 items-center justify-center whitespace-nowrap rounded-[0.4375rem] px-3 font-medium text-footnote text-foreground transition-[background-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							on
								? "bg-segment font-semibold shadow-[0_1px_3px_rgb(0_0_0/0.12)]"
								: "hover:bg-foreground/5",
						)}
					>
						{t(s.labelKey)}
					</Link>
				);
			})}
		</nav>
	);
}
