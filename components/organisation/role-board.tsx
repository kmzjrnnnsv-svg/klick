"use client";

import { MoreHorizontal, Plus, UserMinus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { deleteRoleAssignment } from "@/app/actions/organisation";
import { assignArea, boardAssign } from "@/app/actions/role-board";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-alert";
import {
	DndShell,
	Draggable,
	type DropEvent,
	DropZone,
} from "@/components/ui/dnd";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { errorText } from "@/components/ui/error-text";
import { toast } from "@/components/ui/toast";
import type { AppointmentStatus, FunctionKey } from "@/db/schema/enums";

// Rollen-Tafel (ADR-024, individueller Modus): Personen auf Rollen ziehen
// = vorschlagen, zwischen Rollen = neu besetzen, auf „Abberufen“ =
// abberufen — alles über die Bestellung durch die Geschäftsleitung.
// Bereiche auf eine Rolle = Verantwortlich an deren Controls. Jede Aktion
// gibt es auch im Menü „…“ (Tastatur, Tippen, ohne Ziehen).

export type BoardHolder = {
	id: string;
	userId: string | null;
	pendingEmail: string | null;
	name: string;
	status: AppointmentStatus;
};

export type BoardRole = {
	key: FunctionKey;
	label: string;
	required: boolean;
	own: boolean;
	holders: BoardHolder[];
};

export type BoardPerson = {
	userId: string | null;
	pendingEmail: string | null;
	name: string;
};

export type BoardArea = {
	area: string;
	label: string;
	fn: FunctionKey | null;
};

type PersonPayload = { userId: string | null; pendingEmail: string | null };
type HolderPayload = PersonPayload & { id: string; from: FunctionKey };

const REMOVE = "remove";

export function RoleBoard({
	roles,
	people,
	areas,
	canEdit,
}: {
	roles: BoardRole[];
	people: BoardPerson[];
	areas: BoardArea[];
	canEdit: boolean;
}) {
	const t = useTranslations("Board");
	const ta = useTranslations("Appointments");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const [toRemove, setToRemove] = useState<BoardHolder | null>(null);
	const revoke = useConfirm({
		title: ta("revokeConfirm", { name: toRemove?.name ?? "" }),
		description: ta("revokeConfirmLead"),
		confirmLabel: ta("revoke"),
	});
	const filled = new Set(
		roles
			.filter((r) =>
				r.holders.some(
					(h) =>
						h.status === "appointed" || h.status === "revocation_requested",
				),
			)
			.map((r) => r.key),
	);
	const labelOf = new Map(roles.map((r) => [r.key, r.label]));

	const place = (fn: FunctionKey, p: PersonPayload, fromId?: string) =>
		start(async () => {
			const res = await withStepUp(() =>
				boardAssign({
					fn,
					...(p.userId
						? { userId: p.userId }
						: { pendingEmail: p.pendingEmail }),
					...(fromId ? { fromId } : {}),
				}),
			);
			if (!res.ok)
				return void toast.error(
					res.error === "rolesNotAllowed"
						? t("rolesNotAllowed")
						: errorText(tc, res),
				);
			toast.success(
				res.data.status === "appointed"
					? ta("appointedNow")
					: res.data.waiting === "no_management"
						? ta("proposedNoManagement")
						: ta("proposedWaiting"),
			);
			router.refresh();
		});
	const remove = (h: BoardHolder) => {
		setToRemove(h);
		revoke.ask(() =>
			start(async () => {
				const res = await withStepUp(() => deleteRoleAssignment({ id: h.id }));
				if (!res.ok)
					return void toast.error(
						res.error === "noManagement"
							? ta("noManagement")
							: errorText(tc, res),
					);
				toast.success(
					h.status === "appointed"
						? ta("revocationRequested")
						: ta("withdrawn"),
				);
				router.refresh();
			}),
		);
	};
	const toArea = (area: string, fn: FunctionKey, all = false) =>
		start(async () => {
			const res = await withStepUp(() =>
				assignArea({ area: area as never, fn, all }),
			);
			if (!res.ok)
				return void toast.error(
					res.error === "vacant" ? t("areaVacant") : errorText(tc, res),
				);
			toast.success(t("areaDone", { n: res.data.count }));
			router.refresh();
		});

	function onDrop(e: DropEvent) {
		if (pending || !canEdit) return;
		if (e.drag.kind === "area") {
			const fn = e.drop.payload as FunctionKey;
			if (!filled.has(fn)) return void toast.error(t("areaVacant"));
			return toArea(e.drag.payload as string, fn);
		}
		if (e.dropId === REMOVE) {
			const h = e.drag.payload as HolderPayload;
			const holder = roles.flatMap((r) => r.holders).find((x) => x.id === h.id);
			if (holder) remove(holder);
			return;
		}
		const fn = e.drop.payload as FunctionKey;
		if (e.drag.kind === "holder") {
			const h = e.drag.payload as HolderPayload;
			if (h.from === fn) return;
			return place(fn, h, h.id);
		}
		place(fn, e.drag.payload as PersonPayload);
	}

	const statusText = (s: AppointmentStatus) =>
		s === "appointed"
			? ta("statusAppointed")
			: s === "revocation_requested"
				? ta("statusRevocation")
				: t("statusProposed");

	return (
		<DndShell onDrop={onDrop}>
			{revoke.node}
			<div className="flex flex-col gap-6">
				<section aria-labelledby="board-people" className="flex flex-col gap-2">
					<div className="flex flex-wrap items-baseline justify-between gap-2">
						<h3 id="board-people" className="font-semibold text-headline">
							{t("people")}
						</h3>
						<p className="text-muted-foreground text-footnote">
							{canEdit ? t("peopleHint") : t("readOnly")}
						</p>
					</div>
					<ul className="flex flex-wrap gap-2">
						{people.map((p) => {
							const key = p.userId ?? `invite:${p.pendingEmail}`;
							return (
								<li key={key}>
									<Draggable
										id={`person:${key}`}
										item={{ kind: "person", label: p.name, payload: p }}
										disabled={!canEdit || pending}
										className="flex min-h-(--control-h) items-center gap-1 rounded-full bg-card pr-1 pl-3 text-subhead shadow-xs ring-1 ring-border"
									>
										<span className="max-w-56 truncate">{p.name}</span>
										{p.pendingEmail && !p.userId && (
											<span className="text-muted-foreground text-footnote">
												{t("invited")}
											</span>
										)}
										{canEdit && (
											<RoleMenu
												label={t("assignNamed", { name: p.name })}
												title={t("assignTo")}
												roles={roles}
												onPick={(fn) => place(fn, p)}
											/>
										)}
									</Draggable>
								</li>
							);
						})}
					</ul>
				</section>

				<ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
					{roles.map((r) => (
						<li key={r.key} className="min-w-0">
							<DropZone
								id={`role:${r.key}`}
								target={{
									label: r.label,
									accepts: ["person", "holder", "area"],
									payload: r.key,
								}}
								disabled={!canEdit}
								className="flex h-full min-h-28 flex-col gap-2 rounded-2xl bg-card p-3"
							>
								<div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
									<h4 className="min-w-0 hyphens-auto break-words font-medium text-subhead">
										{r.label}
									</h4>
									{r.required && (
										<Badge variant="outline">{t("required")}</Badge>
									)}
									{r.own && <Badge variant="muted">{t("ownRole")}</Badge>}
								</div>
								{r.holders.length === 0 ? (
									<p className="text-muted-foreground text-footnote">
										{canEdit ? t("dropHere") : t("vacant")}
									</p>
								) : (
									<ul className="flex flex-col gap-1.5">
										{r.holders.map((h) => (
											<li key={h.id}>
												<Draggable
													id={`holder:${h.id}`}
													item={{
														kind: "holder",
														label: `${h.name} (${r.label})`,
														payload: {
															id: h.id,
															userId: h.userId,
															pendingEmail: h.pendingEmail,
															from: r.key,
														} satisfies HolderPayload,
													}}
													disabled={
														!canEdit ||
														pending ||
														h.status === "revocation_requested"
													}
													className="flex min-h-(--control-h) items-center gap-2 rounded-xl bg-muted/60 pr-1 pl-3 text-subhead"
												>
													<span className="min-w-0 grow truncate">
														{h.name}
													</span>
													<Badge
														variant={
															h.status === "appointed" ? "success" : "warning"
														}
													>
														{statusText(h.status)}
													</Badge>
													{canEdit && h.status !== "revocation_requested" && (
														<RoleMenu
															label={t("holderMenu", { name: h.name })}
															title={t("moveTo")}
															roles={roles.filter((x) => x.key !== r.key)}
															onPick={(fn) => place(fn, h, h.id)}
															extra={
																<DropdownMenuItem
																	variant="destructive"
																	onSelect={() => remove(h)}
																>
																	<UserMinus />
																	{h.status === "appointed"
																		? ta("revoke")
																		: ta("withdraw")}
																</DropdownMenuItem>
															}
														/>
													)}
												</Draggable>
											</li>
										))}
									</ul>
								)}
							</DropZone>
						</li>
					))}
					{canEdit && (
						<li className="min-w-0">
							<Link
								href="/einstellungen?tab=rollen"
								className="flex h-full min-h-28 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-border border-dashed p-3 text-primary text-subhead hover:bg-muted/40"
							>
								<Plus aria-hidden className="size-5" />
								{t("newRole")}
							</Link>
						</li>
					)}
				</ul>

				{canEdit && (
					<DropZone
						id={REMOVE}
						target={{ label: t("removeZone"), accepts: ["holder"] }}
						className="flex min-h-(--control-h) items-center justify-center gap-2 rounded-2xl border-2 border-border border-dashed p-3 text-muted-foreground text-subhead"
					>
						<UserMinus aria-hidden className="size-4" />
						{t("removeZone")}
					</DropZone>
				)}

				<section aria-labelledby="board-areas" className="flex flex-col gap-2">
					<div className="flex flex-col gap-0.5">
						<h3 id="board-areas" className="font-semibold text-headline">
							{t("areas")}
						</h3>
						<p className="max-w-prose text-muted-foreground text-footnote">
							{t("areasHint")}
						</p>
					</div>
					<ul className="flex flex-wrap gap-2">
						{areas.map((a) => (
							<li key={a.area} className="min-w-0 max-w-full">
								<Draggable
									id={`area:${a.area}`}
									item={{ kind: "area", label: a.label, payload: a.area }}
									disabled={!canEdit || pending}
									className="flex min-h-(--control-h) max-w-full items-center gap-2 rounded-2xl bg-card py-1.5 pr-1 pl-3 shadow-xs ring-1 ring-border"
								>
									<span className="flex min-w-0 flex-col">
										<span className="text-subhead">{a.label}</span>
										<span className="break-words text-muted-foreground text-footnote">
											{a.fn
												? (labelOf.get(a.fn) ?? t("roleGone"))
												: t("noFunction")}
										</span>
									</span>
									{canEdit && (
										<RoleMenu
											label={t("areaMenu", { area: a.label })}
											title={t("assignTo")}
											roles={roles.filter((r) => filled.has(r.key))}
											onPick={(fn) => toArea(a.area, fn)}
											extra={
												a.fn ? (
													<DropdownMenuItem
														onSelect={() => a.fn && toArea(a.area, a.fn, true)}
													>
														{t("areaAll", {
															fn: labelOf.get(a.fn) ?? t("roleGone"),
														})}
													</DropdownMenuItem>
												) : null
											}
										/>
									)}
								</Draggable>
							</li>
						))}
					</ul>
				</section>
			</div>
		</DndShell>
	);
}

// Menü „…“: dieselben Ziele wie beim Ziehen, ohne Ziehen
function RoleMenu({
	label,
	title,
	roles,
	onPick,
	extra,
}: {
	label: string;
	title: string;
	roles: BoardRole[];
	onPick: (fn: FunctionKey) => void;
	extra?: React.ReactNode;
}) {
	const ownLabel = useTranslations("Entity")("responsibleOwnRoles");
	const catalog = roles.filter((r) => !r.own);
	const own = roles.filter((r) => r.own);
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					size="icon"
					variant="ghost"
					className="size-(--control-h-sm) shrink-0"
					aria-label={label}
					// Ziehen startet nicht über dem Menüknopf
					onPointerDown={(e) => e.stopPropagation()}
					onKeyDown={(e) => e.stopPropagation()}
				>
					<MoreHorizontal />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="max-h-96 overflow-y-auto">
				<DropdownMenuSub>
					<DropdownMenuSubTrigger>{title}</DropdownMenuSubTrigger>
					<DropdownMenuSubContent className="max-h-96 overflow-y-auto">
						{catalog.map((r) => (
							<DropdownMenuItem key={r.key} onSelect={() => onPick(r.key)}>
								{r.label}
							</DropdownMenuItem>
						))}
						{own.length > 0 && catalog.length > 0 && <DropdownMenuSeparator />}
						{own.length > 0 && (
							<DropdownMenuLabel className="text-muted-foreground text-footnote">
								{ownLabel}
							</DropdownMenuLabel>
						)}
						{own.map((r) => (
							<DropdownMenuItem key={r.key} onSelect={() => onPick(r.key)}>
								{r.label}
							</DropdownMenuItem>
						))}
					</DropdownMenuSubContent>
				</DropdownMenuSub>
				{extra}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
