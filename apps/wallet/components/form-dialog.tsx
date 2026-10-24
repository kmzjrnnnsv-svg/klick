"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// Dialog-Hülle und Felder der Wallet-Formulare (wie in Klick).

export function FormDialog({
	title,
	lead,
	trigger,
	open,
	setOpen,
	onSubmit,
	pending,
	disabled,
	children,
	wide,
}: {
	title: string;
	lead?: string;
	trigger: ReactNode;
	open: boolean;
	setOpen: (o: boolean) => void;
	onSubmit: () => void;
	pending: boolean;
	disabled?: boolean;
	children: ReactNode;
	wide?: boolean;
}) {
	const tc = useTranslations("Common");
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent className={wide ? "sm:max-w-2xl" : undefined}>
				<form
					className="flex flex-col gap-4"
					onSubmit={(e) => {
						e.preventDefault();
						onSubmit();
					}}
				>
					<DialogHeader>
						<DialogTitle>{title}</DialogTitle>
						{lead && <DialogDescription>{lead}</DialogDescription>}
					</DialogHeader>
					{children}
					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setOpen(false)}
						>
							{tc("cancel")}
						</Button>
						<Button type="submit" disabled={pending || disabled}>
							{tc("save")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

// Trigger für `DialogTrigger asChild`: Radix injiziert onClick, ref, aria-*
// und data-state — ohne Weitergabe an den Button öffnet der Dialog nie.
type TriggerProps = Omit<ComponentProps<typeof Button>, "children">;

export function EditTrigger({
	label,
	...props
}: TriggerProps & { label?: string }) {
	const tc = useTranslations("Common");
	return (
		<Button
			size="sm"
			variant="ghost"
			className="normal-case tracking-normal"
			{...props}
		>
			{label ?? tc("edit")}
		</Button>
	);
}

export function NewTrigger({
	label,
	...props
}: TriggerProps & { label: string }) {
	return (
		<Button size="sm" {...props}>
			<Plus />
			{label}
		</Button>
	);
}

export function Field({
	id,
	label,
	value,
	onChange,
	type = "text",
	rows,
	required,
	pattern,
	maxLength,
	placeholder,
	title,
}: {
	id: string;
	label: string;
	value: string;
	onChange: (v: string) => void;
	type?: string;
	rows?: number;
	required?: boolean;
	pattern?: string;
	maxLength?: number;
	placeholder?: string;
	title?: string;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<Label htmlFor={id}>{label}</Label>
			{rows ? (
				<Textarea
					id={id}
					rows={rows}
					value={value}
					onChange={(e) => onChange(e.target.value)}
				/>
			) : (
				<Input
					id={id}
					type={type}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					required={required}
					pattern={pattern}
					maxLength={maxLength}
					placeholder={placeholder}
					title={title}
				/>
			)}
		</div>
	);
}
