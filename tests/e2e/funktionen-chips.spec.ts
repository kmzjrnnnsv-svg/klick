import { expect, test } from "@playwright/test";

// /funktionen: Der Hero-Text liegt teilweise über der Rahmenwerk-Auswahl.
// Jeder Chip muss auf seiner ganzen Breite klickbar sein — auch links, wo
// der Name steht, nicht nur rechts an der „+Zahl“ (Fund 03.11.2026).
const SIZES = [
	{ width: 1000, height: 700 },
	{ width: 1280, height: 720 },
	{ width: 1440, height: 900 },
];

for (const size of SIZES) {
	test(`Chips auf /funktionen klickbar bei ${size.width}×${size.height}`, async ({
		page,
	}) => {
		await page.setViewportSize(size);
		await page.goto("/funktionen");
		const chips = page.locator("button[aria-pressed]");
		await expect(chips.first()).toBeVisible();
		const blocked = await chips.evaluateAll((els) =>
			els
				.map((el) => {
					el.scrollIntoView({ block: "center" });
					const r = el.getBoundingClientRect();
					if (r.width === 0) return null;
					// linkes Viertel: dort steht der Name des Rahmenwerks
					const x = r.left + Math.min(12, r.width / 4);
					const y = r.top + r.height / 2;
					const hit = document.elementFromPoint(x, y);
					return hit && el.contains(hit) ? null : el.textContent;
				})
				.filter((x) => x !== null),
		);
		expect(blocked).toEqual([]);
	});
}
