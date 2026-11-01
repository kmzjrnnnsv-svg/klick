import { describe, expect, it } from "vitest";
import {
	matchSettings,
	resolveSettingsSection,
	SETTINGS_SECTIONS,
	settingsGroups,
	visibleSettingsSections,
} from "@/lib/settings/sections";
import de from "@/messages/de.json";

describe("Einstellungen als Liste", () => {
	it("blendet Rollen, Abo und Integrationen je Recht aus", () => {
		const viewer = visibleSettingsSections({
			settings: false,
			integrations: false,
		});
		expect(viewer).not.toContain("rollen");
		expect(viewer).not.toContain("abo");
		expect(viewer).not.toContain("integrationen");
		expect(viewer).toContain("security");
		const owner = visibleSettingsSections({
			settings: true,
			integrations: true,
		});
		expect(owner).toHaveLength(SETTINGS_SECTIONS.length);
		// Mitarbeitende: nur das eigene Konto
		expect(
			visibleSettingsSections({
				settings: false,
				integrations: false,
				accountOnly: true,
			}),
		).toEqual(["security", "notifications"]);
	});

	it("gruppiert in fester Reihenfolge", () => {
		const groups = settingsGroups(
			visibleSettingsSections({ settings: true, integrations: true }),
		);
		expect(groups.map((g) => g.group)).toEqual([
			"account",
			"org",
			"security",
			"connections",
			"methods",
		]);
		expect(groups[0]?.keys).toEqual(["security", "notifications"]);
		// jeder Bereich genau einmal
		const all = groups.flatMap((g) => g.keys);
		expect(new Set(all).size).toBe(all.length);
	});

	it("Suche findet über Name, Satz und Suchwörter, Umlaute egal", () => {
		const items = SETTINGS_SECTIONS.map((x) => ({
			key: x.key,
			title: x.key,
			hint: "",
		}));
		expect(matchSettings("ip", items).map((i) => i.key)).toContain("netzwerk");
		expect(matchSettings("SCHLUSSEL", items).map((i) => i.key)).toContain("ki");
		expect(matchSettings("entra", items).map((i) => i.key)).toEqual(["sso"]);
		expect(matchSettings("  ", items)).toHaveLength(items.length);
		expect(matchSettings("zzqq", items)).toEqual([]);
	});

	it("jeder Bereich hat einen Satz und Suchwörter", () => {
		const texts = de.Settings as Record<string, string>;
		for (const x of SETTINGS_SECTIONS) {
			expect(texts[`hint_${x.key}`], x.key).toBeTruthy();
			expect(x.terms.length, x.key).toBeGreaterThan(0);
		}
	});

	it("löst ?tab= auf und fällt sonst auf Sicherheit zurück", () => {
		const visible = visibleSettingsSections({
			settings: false,
			integrations: false,
		});
		expect(resolveSettingsSection("risk", visible)).toEqual({
			key: "risk",
			chosen: true,
		});
		expect(resolveSettingsSection(undefined, visible)).toEqual({
			key: "security",
			chosen: false,
		});
		// nicht sichtbar oder unbekannt
		expect(resolveSettingsSection("abo", visible).chosen).toBe(false);
		expect(resolveSettingsSection("x", visible).key).toBe("security");
	});
});
