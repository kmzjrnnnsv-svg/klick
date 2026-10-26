import { describe, expect, it } from "vitest";
import {
	resolveSettingsSection,
	SETTINGS_SECTIONS,
	settingsGroups,
	visibleSettingsSections,
} from "@/lib/settings/sections";

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
		expect(groups.map((g) => g.group)).toEqual(["account", "org", "methods"]);
		expect(groups[0]?.keys).toEqual(["security", "notifications"]);
		// jeder Bereich genau einmal
		const all = groups.flatMap((g) => g.keys);
		expect(new Set(all).size).toBe(all.length);
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
