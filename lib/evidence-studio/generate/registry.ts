import { abweichungen } from "../kinds/abweichungen";
import { kontext } from "../kinds/kontext";
import type { Generator } from "./types";

// Nachweisarten, die Klick selbst erzeugen kann (lib/evidence-studio/kinds)
const ALL: readonly Generator[] = [kontext, abweichungen];

export const GENERATORS: ReadonlyMap<string, Generator> = new Map(
	ALL.map((g) => [g.code, g]),
);

export const canGenerate = (code: string): boolean => GENERATORS.has(code);
