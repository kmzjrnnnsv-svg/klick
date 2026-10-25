"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { deleteOrgRole, saveOrgRole } from "@/app/actions/roles";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useConfirm } from "@/components/ui/confirm-alert";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { errorText } from "@/components/ui/error-text";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import type { CatalogArea } from "@/lib/auth/permission-catalog";
import type { RolePermissions } from "@/lib/auth/permissions";

type RoleItem = {
	id: string;
	name: string;
	description: string | null;
	// Aufgaben fürs Bestellungsschreiben (eine je Zeile)
	tasks: string | null;
	permissions: RolePermissions;
	// bestellt oder vorgeschlagen; die Rechte gelten erst mit der Bestellung
	memberIds: string[];
	waitingMemberIds: string[];
	pendingEmails: string[];
};

type MemberOption = { memberId: string; name: string };

// Ressource + Aktion als Klartext („Dienstleister: anlegen“)
export function usePermissionLabel() {
	const t = useTranslations("Permissions");
	return {
		resource: (r: string) => t(`res_${r}` as "res_risk"),
		action: (r: string, a: string) =>
			r === "export" && a === "create"
				? t("act_export_create")
				: t(`act_${a}` as "act_read"),
		area: (k: string) => t(`area_${k}` as "area_register"),
	};
}

function countRights(p: RolePermissions): number {
	return Object.values(p).reduce((n, acts) => n + (acts?.length ?? 0), 0);
}

function RightsList({ permissions }: { permissions: RolePermissions }) {
	const l = usePermissionLabel();
	const entries = Object.entries(permissions).filter(
		([, acts]) => (acts?.length ?? 0) > 0,
	);
	if (entries.length === 0) return null;
	return (
		<ul className="flex flex-wrap gap-1">
			{entries.map(([res, acts]) => (
				<li key={res}>
					<Badge
						variant="outline"
						className="h-auto max-w-full whitespace-normal text-left"
					>
						{l.resource(res)}:{" "}
						{(acts ?? []).map((a) => l.action(res, a)).join(", ")}
					</Badge>
				</li>
			))}
		</ul>
	);
}

function RoleDialog({
	item,
	catalog,
	members,
	editorPreset,
	trigger,
}: {
	item: RoleItem | null;
	catalog: CatalogArea[];
	members: MemberOption[];
	editorPreset: RolePermissions;
	trigger: React.ReactNode;
}) {
	const t = useTranslations("Roles");
	const tc = useTranslations("Common");
	const l = usePermissionLabel();
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, start] = useTransition();
	const [name, setName] = useState(item?.name ?? "");
	const [description, setDescription] = useState(item?.description ?? "");
	const [tasks, setTasks] = useState(item?.tasks ?? "");
	const [perms, setPerms] = useState<RolePermissions>(item?.permissions ?? {});
	const [memberIds, setMemberIds] = useState<string[]>(item?.memberIds ?? []);

	const has = (r: string, a: string) =>
		(perms[r as keyof RolePermissions] ?? []).includes(a);
	function toggle(r: string, a: string, on: boolean) {
		const cur = new Set(perms[r as keyof RolePermissions] ?? []);
		if (on) cur.add(a);
		else cur.delete(a);
		setPerms({ ...perms, [r]: [...cur] });
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				setOpen(o);
				if (o) {
					setName(item?.name ?? "");
					setDescription(item?.description ?? "");
					setTasks(item?.tasks ?? "");
					setPerms(item?.permissions ?? {});
					setMemberIds(item?.memberIds ?? []);
				}
			}}
		>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent className="sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>
						{item ? t("editTitle", { name: item.name }) : t("newTitle")}
					</DialogTitle>
					<DialogDescription>{t("lead")}</DialogDescription>
				</DialogHeader>
				<form
					className="flex flex-col gap-5"
					onSubmit={(e) => {
						e.preventDefault();
						start(async () => {
							const res = await withStepUp(() =>
								saveOrgRole({
									id: item?.id,
									name,
									description,
									tasks,
									permissions: perms,
									memberIds,
								}),
							);
							if (!res.ok) {
								toast.error(
									res.error === "roleNameTaken"
										? t("roleNameTaken")
										: res.error === "step_up_required"
											? t("stepUp")
											: errorText(tc, res),
								);
								return;
							}
							toast.success(
								res.data.waiting > 0
									? t("savedWaiting", { n: res.data.waiting })
									: t("saved"),
							);
							setOpen(false);
							router.refresh();
						});
					}}
				>
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="role-name">{t("name")}</Label>
							<Input
								id="role-name"
								required
								minLength={2}
								maxLength={60}
								autoComplete="off"
								placeholder={t("namePlaceholder")}
								value={name}
								onChange={(e) => setName(e.target.value)}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="role-desc">{t("description")}</Label>
							<Textarea
								id="role-desc"
								rows={1}
								maxLength={300}
								value={description}
								onChange={(e) => setDescription(e.target.value)}
							/>
						</div>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="role-tasks">{t("tasks")}</Label>
						<Textarea
							id="role-tasks"
							rows={3}
							maxLength={2000}
							placeholder={t("tasksPlaceholder")}
							value={tasks}
							onChange={(e) => setTasks(e.target.value)}
						/>
						<p className="text-muted-foreground text-footnote">
							{t("tasksHint")}
						</p>
					</div>

					<section className="flex flex-col gap-3">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<div>
								<h3 className="font-medium text-subhead">{t("rights")}</h3>
								<p className="text-muted-foreground text-footnote">
									{t("rightsHint")} {t("decideHint")}
								</p>
							</div>
							<div className="flex gap-2">
								<Button
									type="button"
									size="sm"
									variant="outline"
									onClick={() => setPerms(editorPreset)}
								>
									{t("presetEditor")}
								</Button>
								<Button
									type="button"
									size="sm"
									variant="ghost"
									onClick={() => setPerms({})}
								>
									{t("presetNone")}
								</Button>
							</div>
						</div>
						{catalog.map((area) => (
							<fieldset
								key={area.key}
								className="flex flex-col gap-1 rounded-2xl bg-card p-3"
							>
								<legend className="px-1 font-medium text-footnote">
									{l.area(area.key)}
								</legend>
								{area.resources.map((r) => (
									<div
										key={r.resource}
										className="grid grid-cols-1 items-start gap-1 py-1 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] sm:gap-3"
									>
										<span className="text-subhead">
											{l.resource(r.resource)}
										</span>
										<div className="flex flex-wrap gap-x-4 gap-y-1">
											{r.actions.map((a) => {
												const id = `perm-${r.resource}-${a}`;
												return (
													<label
														key={a}
														htmlFor={id}
														className="flex items-center gap-1.5 text-subhead"
													>
														<Checkbox
															id={id}
															checked={has(r.resource, a)}
															onCheckedChange={(v) =>
																toggle(r.resource, a, v === true)
															}
														/>
														{l.action(r.resource, a)}
													</label>
												);
											})}
										</div>
									</div>
								))}
							</fieldset>
						))}
					</section>

					<section className="flex flex-col gap-2">
						<h3 className="font-medium text-subhead">{t("members")}</h3>
						<p className="text-muted-foreground text-footnote">
							{t("membersHint")}
						</p>
						{members.length === 0 ? (
							<p className="text-muted-foreground text-subhead">
								{t("noMembers")}
							</p>
						) : (
							<div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
								{members.map((m) => {
									const id = `role-member-${m.memberId}`;
									return (
										<label
											key={m.memberId}
											htmlFor={id}
											className="flex items-center gap-2 text-subhead"
										>
											<Checkbox
												id={id}
												checked={memberIds.includes(m.memberId)}
												onCheckedChange={(v) =>
													setMemberIds(
														v === true
															? [...memberIds, m.memberId]
															: memberIds.filter((x) => x !== m.memberId),
													)
												}
											/>
											<span className="min-w-0 truncate">{m.name}</span>
											{item?.waitingMemberIds.includes(m.memberId) && (
												<Badge variant="warning">{t("waiting")}</Badge>
											)}
										</label>
									);
								})}
							</div>
						)}
					</section>

					<DialogFooter>
						<Button type="submit" disabled={pending || name.trim().length < 2}>
							{pending ? tc("saving") : t("save")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

export function RolesPanel({
	roles,
	members,
	catalog,
	editorPreset,
	baseRoles,
	canEdit: canEditSettings,
	individual,
}: {
	roles: RoleItem[];
	members: MemberOption[];
	catalog: CatalogArea[];
	editorPreset: RolePermissions;
	baseRoles: {
		role: string;
		label: string;
		hint: string;
		permissions: RolePermissions;
	}[];
	canEdit: boolean;
	// eigene Rollen anlegen, ändern, löschen nur im individuellen Modus
	individual: boolean;
}) {
	const canEdit = canEditSettings && individual;
	const t = useTranslations("Roles");
	const tc = useTranslations("Common");
	const router = useRouter();
	const [pending, start] = useTransition();
	const nameOf = new Map(members.map((m) => [m.memberId, m.name]));
	const [toDelete, setToDelete] = useState<string>("");
	const del = useConfirm({
		title: t("deleteConfirm", { name: toDelete }),
		confirmLabel: tc("delete"),
	});
	const remove = (id: string) =>
		start(async () => {
			const res = await withStepUp(() => deleteOrgRole({ id }));
			if (!res.ok) {
				const used = (res as { fieldErrors?: Record<string, string[]> })
					.fieldErrors?.workflows;
				toast.error(
					res.error === "roleInUse"
						? t("roleInUse", {
								workflows: (used ?? []).join(", "),
							})
						: res.error === "roleHasHolders"
							? t("roleHasHolders")
							: res.error === "roleIsResponsible"
								? t("roleIsResponsible")
								: res.error === "step_up_required"
									? t("stepUp")
									: errorText(tc, res),
				);
				return;
			}
			toast.success(t("deleted"));
			router.refresh();
		});

	return (
		<div className="flex flex-col gap-8">
			<section className="flex flex-col gap-3">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="max-w-prose">
						<h2 className="font-medium">{t("customTitle")}</h2>
						<p className="text-muted-foreground text-subhead">{t("lead")}</p>
						{!individual && (
							<p
								className="mt-2 rounded-xl bg-muted p-3 text-subhead"
								role="status"
							>
								{t("standardLocked")}{" "}
								<Link
									href="/einstellungen?tab=workflows"
									className="text-primary hover:underline"
								>
									{t("standardLockedLink")}
								</Link>
							</p>
						)}
					</div>
					{canEdit && (
						<RoleDialog
							item={null}
							catalog={catalog}
							members={members}
							editorPreset={editorPreset}
							trigger={
								<Button size="sm">
									<Plus />
									{t("new")}
								</Button>
							}
						/>
					)}
				</div>
				{roles.length === 0 ? (
					<p className="rounded-2xl bg-card p-4 text-muted-foreground text-subhead">
						{t("empty")}
					</p>
				) : (
					<ul className="flex flex-col list-inset overflow-hidden rounded-2xl bg-card">
						{roles.map((r) => (
							<li key={r.id} className="flex flex-col gap-2 p-3 sm:flex-row">
								<div className="flex min-w-0 grow flex-col gap-1.5">
									<p className="font-medium">
										{r.name}{" "}
										<span className="font-normal text-muted-foreground text-footnote">
											· {t("rightsCount", { n: countRights(r.permissions) })} ·{" "}
											{t("membersCount", {
												n: r.memberIds.length + r.pendingEmails.length,
											})}
										</span>
									</p>
									{r.description && (
										<p className="text-muted-foreground text-subhead">
											{r.description}
										</p>
									)}
									<RightsList permissions={r.permissions} />
									{(r.memberIds.length > 0 || r.pendingEmails.length > 0) && (
										<p className="text-muted-foreground text-footnote">
											{[
												...r.memberIds.map(
													(id) =>
														`${nameOf.get(id) ?? "—"}${r.waitingMemberIds.includes(id) ? ` (${t("waiting")})` : ""}`,
												),
												...r.pendingEmails.map((e) => `${e} (${t("pending")})`),
											].join(" · ")}
										</p>
									)}
								</div>
								{canEdit && (
									<div className="flex shrink-0 items-start gap-1">
										<RoleDialog
											item={r}
											catalog={catalog}
											members={members}
											editorPreset={editorPreset}
											trigger={
												<Button size="sm" variant="outline">
													<Pencil />
													{t("edit")}
												</Button>
											}
										/>
										<Button
											size="icon"
											variant="ghost"
											aria-label={`${t("delete")}: ${r.name}`}
											disabled={pending}
											onClick={() => {
												setToDelete(r.name);
												del.ask(() => remove(r.id));
											}}
										>
											<Trash2 />
										</Button>
									</div>
								)}
							</li>
						))}
					</ul>
				)}
				{del.node}
			</section>

			<section className="flex flex-col gap-3">
				<div className="max-w-prose">
					<h2 className="font-medium">{t("baseTitle")}</h2>
					<p className="text-muted-foreground text-subhead">{t("baseLead")}</p>
				</div>
				<ul className="flex flex-col list-inset overflow-hidden rounded-2xl bg-card">
					{baseRoles.map((b) => (
						<li key={b.role} className="px-3 py-1">
							<details>
								<summary className="cursor-pointer py-2 text-subhead pointer-coarse:py-3">
									<span className="font-medium">{b.label}</span>{" "}
									<span className="text-muted-foreground">— {b.hint}</span>
								</summary>
								<div className="mt-2">
									<RightsList permissions={b.permissions} />
								</div>
							</details>
						</li>
					))}
				</ul>
			</section>
		</div>
	);
}
