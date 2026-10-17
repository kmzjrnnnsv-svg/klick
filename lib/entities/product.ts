import type { ProductStatus } from "@/db/schema/enums";
import { transitions } from "./status-machine";
import type { EntityDef, StatusMachine } from "./types";

// Lebenszyklus eines Produkts (CRA): in Entwicklung → auf dem Markt →
// Supportende → zurückgezogen. Supportende und Rückzug brauchen eine
// Begründung (Nutzerinformation, Marktüberwachung).
export const PRODUCT_STATUSES = [
	"development",
	"on_market",
	"end_of_support",
	"withdrawn",
] as const satisfies readonly ProductStatus[];

export const PRODUCT_STATUS: StatusMachine<ProductStatus> = {
	states: PRODUCT_STATUSES,
	initial: "development",
	labelKey: {
		development: "prdDevelopment",
		on_market: "prdOnMarket",
		end_of_support: "prdEndOfSupport",
		withdrawn: "prdWithdrawn",
	},
	tone: {
		development: "default",
		on_market: "success",
		end_of_support: "warning",
		withdrawn: "muted",
	},
	transitions: transitions<ProductStatus>([
		["development", "on_market", "placeOnMarket", undefined, true],
		["on_market", "end_of_support", "endSupport", "note", true],
		["on_market", "withdrawn", "withdrawProduct", "note"],
		["end_of_support", "withdrawn", "withdrawProduct", "note", true],
		["end_of_support", "on_market", "reactivate", "note"],
		["withdrawn", "on_market", "reactivate", "note", true],
		["development", "withdrawn", "withdrawProduct", "note"],
	]),
	done: ["withdrawn"],
};

export const PRODUCT_ENTITY: EntityDef<ProductStatus> = {
	kind: "product",
	route: "/produkte",
	i18nNamespace: "Products",
	statusMachine: PRODUCT_STATUS,
};
