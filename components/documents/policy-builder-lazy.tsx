"use client";

import dynamic from "next/dynamic";

// Der Richtlinien-Baukasten ist groß und steht nur an Dokumenten im
// Baukasten-Modus: erst laden, wenn er gezeigt wird (Budget je Seite,
// scripts/check-bundle-budget.ts). Server-Komponenten können Client-
// Komponenten nicht selbst aufteilen, deshalb diese Hülle.
export const PolicyBuilderPanel = dynamic(() =>
	import("./policy-builder").then((m) => m.PolicyBuilderPanel),
);
