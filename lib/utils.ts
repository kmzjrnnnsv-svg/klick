import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Textstile aus styles/tokens.css (text-large-title … text-caption-2) als
// Schriftgrößen anmelden — sonst hält twMerge sie für Textfarben und wirft
// z. B. text-white neben text-subhead weg.
export const TEXT_STYLES = [
	"large-title",
	"title-1",
	"title-2",
	"title-3",
	"headline",
	"body",
	"callout",
	"subhead",
	"footnote",
	"caption",
	"caption-2",
] as const;

const twMerge = extendTailwindMerge({
	extend: { theme: { text: [...TEXT_STYLES] } },
});

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
