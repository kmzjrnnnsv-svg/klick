import type { StatusMachine, Transition, TransitionContext } from "./types";

// Reine Funktionen über Status-Maschinen (getestet).

export type AvailableTransition<S extends string> = Transition<S> & {
	// false, wenn `requires` im aktuellen Kontext nicht erfüllt ist
	enabled: boolean;
	blockedBy?: "note" | "approval";
};

export function nextTransitions<S extends string>(
	machine: StatusMachine<S>,
	status: S,
	ctx: TransitionContext = {},
): AvailableTransition<S>[] {
	return machine.transitions
		.filter((t) => t.from === status)
		.map((t) => {
			if (t.requires === "note") {
				return {
					...t,
					enabled: Boolean(ctx.hasNote),
					blockedBy: ctx.hasNote ? undefined : "note",
				};
			}
			if (t.requires?.startsWith("approval:")) {
				const ok = Boolean(ctx.approvalsSatisfied);
				return { ...t, enabled: ok, blockedBy: ok ? undefined : "approval" };
			}
			return { ...t, enabled: true };
		});
}

export function primaryTransition<S extends string>(
	machine: StatusMachine<S>,
	status: S,
	ctx: TransitionContext = {},
): AvailableTransition<S> | null {
	const list = nextTransitions(machine, status, ctx);
	return list.find((t) => t.primary) ?? list[0] ?? null;
}

export function canTransition<S extends string>(
	machine: StatusMachine<S>,
	from: S,
	to: S,
	ctx: TransitionContext = {},
): { ok: true } | { ok: false; reason: "invalid" | "note" | "approval" } {
	const t = nextTransitions(machine, from, ctx).find((x) => x.to === to);
	if (!t) return { ok: false, reason: "invalid" };
	if (!t.enabled) return { ok: false, reason: t.blockedBy ?? "invalid" };
	return { ok: true };
}

export function isDone<S extends string>(
	machine: StatusMachine<S>,
	status: S,
): boolean {
	return machine.done.includes(status);
}

// Hilfsbau für Maschinen, deren Übergänge als Tupel notiert sind.
export function transitions<S extends string>(
	rows: [S, S, string, Transition<S>["requires"]?, boolean?][],
): Transition<S>[] {
	return rows.map(([from, to, labelKey, requires, primary]) => ({
		from,
		to,
		labelKey,
		requires,
		primary,
	}));
}
