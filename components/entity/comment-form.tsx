import type { EntityKind } from "@/db/schema/enums";
import { requireOrgPage } from "@/lib/auth/gates";
import { allows } from "@/lib/auth/permissions";
import { auditorMayComment } from "@/lib/compliance/audit-workspace";
import { CommentFormClient } from "./comment-form-client";

// Kommentarfeld mit derselben Prüfung wie die Action (`addComment`): ohne
// Recht oder als Prüfer:in außerhalb von Audit, Anfrage und Finding gibt es
// kein Feld statt eines Fehlers beim Absenden. Die Zugangsprüfung läuft je
// Anfrage nur einmal (React.cache in den Guards).
export async function CommentForm({
	entityType,
	entityId,
	link,
}: {
	entityType: EntityKind;
	entityId: string;
	link: string;
}) {
	const ctx = await requireOrgPage(undefined, { employees: true });
	if (
		!allows(ctx, { comment: ["create"] }) ||
		!auditorMayComment(ctx.orgRole, entityType)
	)
		return null;
	return (
		<CommentFormClient
			entityType={entityType}
			entityId={entityId}
			link={link}
		/>
	);
}
