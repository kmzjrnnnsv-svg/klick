import { describe, expect, it } from "vitest";
import {
	channelList,
	channelSet,
	channelsFor,
	type DeliveryState,
	mailDecision,
	NO_REMOTE,
	PUSH_MAX_ATTEMPTS,
	pushWanted,
	TEAMS_MAX_ATTEMPTS,
	teamsWanted,
	wantsChannel,
} from "@/lib/notifications/channels";
import { notificationUrl } from "@/lib/notifications/link";

// Kanäle je Benachrichtigung (Mail, Push, Teams), rein: alte Werte lesen,
// Zustellung je Kanal, Entscheidung der Mail-Jobs mit Rückfall auf Mail.

const fresh: DeliveryState = {
	...NO_REMOTE,
	teamsActive: true,
	pushActive: true,
	teamsSentAt: null,
	teamsAttempts: 0,
	pushSentAt: null,
	pushAttempts: 0,
};
const now = { digest: false, digestEnabled: true };

describe("gespeicherte Kanäle lesen", () => {
	it("ohne Einstellung nur Mail", () => {
		expect(channelSet(undefined)).toEqual({
			mail: true,
			push: false,
			teams: false,
		});
		expect(channelsFor(undefined, "task_assigned").mail).toBe(true);
	});
	it("alte Werte mail | teams | both", () => {
		expect(channelSet("mail")).toEqual({
			mail: true,
			push: false,
			teams: false,
		});
		expect(channelSet("teams")).toEqual({
			mail: false,
			push: false,
			teams: true,
		});
		expect(channelSet("both")).toEqual({
			mail: true,
			push: false,
			teams: true,
		});
	});
	it("neue Listen, auch mehrere Wege", () => {
		expect(channelSet(["push"])).toEqual({
			mail: false,
			push: true,
			teams: false,
		});
		expect(channelList(channelSet(["teams", "mail", "push"]))).toEqual([
			"mail",
			"push",
			"teams",
		]);
	});
	it("will die Person überhaupt Push?", () => {
		const prefs = {
			channels: {
				task_assigned: ["mail" as const],
				mentioned: ["push" as const],
			},
			digestEnabled: true,
		};
		expect(wantsChannel(prefs, "push")).toBe(true);
		expect(wantsChannel(prefs, "teams")).toBe(false);
		expect(wantsChannel(undefined, "push")).toBe(false);
	});
});

describe("Zustellung je Kanal", () => {
	it("Push nur gewählt, mit Gerät und unter der Grenze", () => {
		const set = channelSet(["push"]);
		expect(pushWanted(set, fresh)).toBe(true);
		expect(pushWanted(channelSet("mail"), fresh)).toBe(false);
		expect(pushWanted(set, { ...fresh, pushActive: false })).toBe(false);
		expect(pushWanted(set, { ...fresh, pushSentAt: new Date() })).toBe(false);
		expect(pushWanted(set, { ...fresh, pushAttempts: PUSH_MAX_ATTEMPTS })).toBe(
			false,
		);
	});
	it("Teams wie bisher", () => {
		expect(teamsWanted(channelSet("teams"), fresh)).toBe(true);
		expect(
			teamsWanted(channelSet("teams"), {
				...fresh,
				teamsAttempts: TEAMS_MAX_ATTEMPTS,
			}),
		).toBe(false);
	});
});

describe("Mail-Jobs: senden, warten oder auslassen", () => {
	it("Mail gewählt = immer Mail", () => {
		expect(mailDecision(channelSet(["mail", "push"]), fresh, now)).toBe("send");
	});
	it("nur Push: warten, solange Push es versucht, dann auslassen", () => {
		const set = channelSet(["push"]);
		expect(mailDecision(set, fresh, now)).toBe("wait");
		expect(mailDecision(set, { ...fresh, pushSentAt: new Date() }, now)).toBe(
			"skip",
		);
	});
	it("nur Push, drei Fehlversuche oder kein Gerät: Rückfall auf Mail", () => {
		const set = channelSet(["push"]);
		expect(
			mailDecision(set, { ...fresh, pushAttempts: PUSH_MAX_ATTEMPTS }, now),
		).toBe("send");
		expect(mailDecision(set, { ...fresh, pushActive: false }, now)).toBe(
			"send",
		);
	});
	it("Push und Teams: einer genügt, Mail nur, wenn beide scheitern", () => {
		const set = channelSet(["push", "teams"]);
		expect(mailDecision(set, { ...fresh, teamsSentAt: new Date() }, now)).toBe(
			"skip",
		);
		expect(
			mailDecision(
				set,
				{ ...fresh, teamsActive: false, pushAttempts: PUSH_MAX_ATTEMPTS },
				now,
			),
		).toBe("send");
		expect(mailDecision(set, { ...fresh, teamsActive: false }, now)).toBe(
			"wait",
		);
	});
	it("Tages-Mail aus: Digest-Arten entfallen, Sofort-Mails bleiben", () => {
		const set = channelSet("mail");
		expect(
			mailDecision(set, fresh, { digest: true, digestEnabled: false }),
		).toBe("skip");
		expect(
			mailDecision(set, fresh, { digest: false, digestEnabled: false }),
		).toBe("send");
	});
});

describe("Link der Benachrichtigung", () => {
	const base = "https://raza.work/";
	it("nur Pfade der eigenen Instanz", () => {
		expect(notificationUrl(base, "/risiken/1")).toBe(
			"https://raza.work/risiken/1",
		);
		expect(notificationUrl(base, null)).toBe("https://raza.work/heute");
		expect(notificationUrl(base, "https://evil.example/x")).toBe(
			"https://raza.work/heute",
		);
		expect(notificationUrl(base, "//evil.example/x")).toBe(
			"https://raza.work/heute",
		);
		expect(notificationUrl(base, "https://raza.work/heute/aufgaben")).toBe(
			"https://raza.work/heute/aufgaben",
		);
	});
});
