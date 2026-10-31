import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { ListRow, ListSection } from "@/components/ui/list";
import type { CustomFrameworkStatus } from "@/db/schema/custom-frameworks";
import { CreateCustomFrameworkDialog } from "./create-dialog";

export type CustomFrameworkListItem = {
	id: string;
	name: string;
	status: CustomFrameworkStatus;
	requirements: number;
	mapped: number;
};

export const STATUS_TONE = {
	draft: "muted",
	active: "success",
	retired: "outline",
} as const;

// Einstellungen > Rahmenwerke: eigene Rahmenwerke der Org als gruppierte
// Liste, Zeile führt in den Editor
export async function CustomFrameworkList({
	items,
	canCreate,
	copyOptions,
}: {
	items: readonly CustomFrameworkListItem[];
	canCreate: boolean;
	copyOptions: { slug: string; name: string; requirements: number }[];
}) {
	const t = await getTranslations("CustomFrameworks");
	return (
		<ListSection
			title={t("sectionTitle")}
			footer={t("sectionFooter")}
			actions={
				canCreate ? (
					<CreateCustomFrameworkDialog copyOptions={copyOptions} />
				) : undefined
			}
		>
			{items.length === 0 ? (
				<ListRow subtitle={t("empty")} />
			) : (
				items.map((f) => (
					<ListRow
						key={f.id}
						href={`/rahmenwerke/eigene/${f.id}`}
						title={f.name}
						subtitle={t("counts", {
							requirements: f.requirements,
							mapped: f.mapped,
						})}
						accessory={
							<Badge variant={STATUS_TONE[f.status]}>
								{t(`status_${f.status}`)}
							</Badge>
						}
					/>
				))
			)}
		</ListSection>
	);
}
