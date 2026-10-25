// Freigabe-Designer per Ziehen (ADR-024, individueller Modus): was eine
// Ablage mit den Stufen macht. Rein; der Editor ruft es mit seinem Entwurf.
// Ziehen ist nie der einzige Weg — Auswahl, „nach oben/unten“ und Entfernen
// bleiben im Editor.

export type DesignerDrag =
	| { type: "rule"; rule: string }
	| { type: "everyone" }
	| { type: "assigned"; step: string; rule: string }
	| { type: "step"; step: string };

export type DesignerDrop =
	| { type: "step"; step: string }
	| { type: "new" }
	| { type: "palette" };

type StepLike = { key: string; approvers: string[]; everyone: boolean };

export const MAX_STEPS = 8;

export function applyDesignerDrop<S extends StepLike>(
	steps: S[],
	drag: DesignerDrag,
	drop: DesignerDrop,
	make: (approvers: string[]) => S,
): S[] {
	const without = (xs: S[], key: string, rule: string) =>
		xs.map((s) =>
			s.key === key
				? { ...s, approvers: s.approvers.filter((r) => r !== rule) }
				: s,
		);
	const add = (xs: S[], key: string, rule: string) =>
		xs.map((s) =>
			s.key === key && !s.approvers.includes(rule)
				? { ...s, approvers: [...s.approvers, rule] }
				: s,
		);
	const room = steps.length < MAX_STEPS;
	switch (drag.type) {
		case "rule":
			if (drop.type === "step") return add(steps, drop.step, drag.rule);
			if (drop.type === "new" && room) return [...steps, make([drag.rule])];
			return steps;
		case "everyone":
			return drop.type === "step"
				? steps.map((s) => (s.key === drop.step ? { ...s, everyone: true } : s))
				: steps;
		case "assigned":
			if (drop.type === "palette") return without(steps, drag.step, drag.rule);
			if (drop.type === "step")
				return drop.step === drag.step
					? steps
					: add(without(steps, drag.step, drag.rule), drop.step, drag.rule);
			if (drop.type === "new" && room)
				return [...without(steps, drag.step, drag.rule), make([drag.rule])];
			return steps;
		case "step": {
			if (drop.type !== "step" || drop.step === drag.step) return steps;
			const from = steps.findIndex((s) => s.key === drag.step);
			const to = steps.findIndex((s) => s.key === drop.step);
			if (from < 0 || to < 0) return steps;
			const out = [...steps];
			const [moved] = out.splice(from, 1);
			if (moved) out.splice(to, 0, moved);
			return out;
		}
	}
}
