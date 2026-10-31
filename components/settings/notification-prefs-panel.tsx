"use client";

import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useState, useTransition } from "react";
import { saveNotificationPreferences } from "@/app/actions/notification-preferences";
import {
	removePushSubscription,
	savePushSubscription,
	sendPushTest,
} from "@/app/actions/push";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { errorText } from "@/components/ui/error-text";
import { FormAlert } from "@/components/ui/form-alert";
import { ListGroup, ListRow, ListSection } from "@/components/ui/list";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import type { NotificationKind } from "@/db/schema/enums";
import type { DeliveryChannel } from "@/db/schema/teams";

// Einstellungen > Benachrichtigungen: je Art Mail, Push und/oder Teams
// (Push nur mit Web Push und eigenem Gerät, Teams nur, wenn die Org es
// eingeschaltet hat), Tages-Mail an/aus, Geräte für Push. Kommt ein Hinweis
// dreimal nicht per Push oder Teams an, geht er per Mail.

type Device = {
	id: string;
	label: string | null;
	createdAt: Date;
	lastSuccessAt: Date | null;
	lastError: string | null;
	host: string;
	ref: string;
};

type PushState =
	| "checking"
	| "unsupported"
	| "ios_home"
	| "denied"
	| "off"
	| "on";

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
	const pad = "=".repeat((4 - (s.length % 4)) % 4);
	const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
	const out = new Uint8Array(new ArrayBuffer(raw.length));
	for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
	return out;
}

async function refOf(endpoint: string): Promise<string> {
	const d = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(endpoint),
	);
	return [...new Uint8Array(d)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")
		.slice(0, 16);
}

function isIos(): boolean {
	return (
		/iPad|iPhone|iPod/.test(navigator.userAgent) ||
		(navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
	);
}

function pushSupported(): boolean {
	return (
		"serviceWorker" in navigator &&
		"PushManager" in window &&
		"Notification" in window
	);
}

// Name für die Geräteliste, nur grob (kein Fingerabdruck)
function deviceLabel(): string {
	const ua = navigator.userAgent;
	const browser = /Edg\//.test(ua)
		? "Edge"
		: /Firefox\//.test(ua)
			? "Firefox"
			: /Chrome\//.test(ua)
				? "Chrome"
				: /Safari\//.test(ua)
					? "Safari"
					: "Browser";
	const os = /iPhone/.test(ua)
		? "iPhone"
		: /iPad/.test(ua) || (isIos() && /Macintosh/.test(ua))
			? "iPad"
			: /Android/.test(ua)
				? "Android"
				: /Mac OS X/.test(ua)
					? "Mac"
					: /Windows/.test(ua)
						? "Windows"
						: /Linux/.test(ua)
							? "Linux"
							: "";
	return os ? `${browser} auf ${os}` : browser;
}

function serviceOf(host: string): string {
	if (host.endsWith("apple.com")) return "Apple";
	if (host.endsWith("googleapis.com")) return "Google";
	if (host.endsWith("mozilla.com")) return "Mozilla";
	if (host.endsWith("windows.com")) return "Microsoft";
	return host;
}

const PUSH_ERRORS = [
	"push_not_configured",
	"push_endpoint_not_allowed",
	"push_too_many",
	"push_no_device",
	"push_bad_keys",
] as const;
type PushErrorCode = (typeof PUSH_ERRORS)[number];

function pushCode(res: { error?: unknown }): PushErrorCode | null {
	const c = typeof res.error === "string" ? res.error : "";
	return (PUSH_ERRORS as readonly string[]).includes(c)
		? (c as PushErrorCode)
		: null;
}

async function currentSubscription(): Promise<PushSubscription | null> {
	const reg = await navigator.serviceWorker.getRegistration("/");
	return reg ? reg.pushManager.getSubscription() : null;
}

export function NotificationPrefsPanel({
	kinds,
	initial,
	teamsActive,
	push,
}: {
	kinds: { kind: NotificationKind; label: string; immediate: boolean }[];
	initial: {
		channels: Partial<Record<NotificationKind, DeliveryChannel[]>>;
		digestEnabled: boolean;
	};
	teamsActive: boolean;
	push: { publicKey: string; devices: Device[] } | null;
}) {
	const t = useTranslations("NotificationPrefs");
	const tc = useTranslations("Common");
	const format = useFormatter();
	const router = useRouter();
	const [pending, start] = useTransition();
	const [pushBusy, startPush] = useTransition();
	const [channels, setChannels] = useState(initial.channels);
	const [digest, setDigest] = useState(initial.digestEnabled);
	const [error, setError] = useState<string | null>(null);
	const [pushError, setPushError] = useState<string | null>(null);
	const [pushState, setPushState] = useState<PushState>("checking");
	const [myRef, setMyRef] = useState<string | null>(null);

	const pushErr = (res: { error?: unknown; ref?: unknown }) => {
		const code = pushCode(res);
		return code ? t(`error_${code}`) : errorText(tc, res);
	};
	const devices = push?.devices ?? [];
	const options: DeliveryChannel[] = [
		"mail",
		...(push ? (["push"] as const) : []),
		...(teamsActive ? (["teams"] as const) : []),
	];
	const choice = options.length > 1;

	const detect = useCallback(async () => {
		if (!push) return;
		if (!pushSupported()) {
			setPushState(isIos() ? "ios_home" : "unsupported");
			return;
		}
		if (Notification.permission === "denied") {
			setPushState("denied");
			return;
		}
		try {
			const sub = await currentSubscription();
			const ref = sub ? await refOf(sub.endpoint) : null;
			setMyRef(ref);
			setPushState(ref && devices.some((d) => d.ref === ref) ? "on" : "off");
		} catch {
			setPushState("off");
		}
	}, [push, devices]);

	useEffect(() => {
		void detect();
	}, [detect]);

	const selected = (kind: NotificationKind) => channels[kind] ?? ["mail"];

	function toggle(kind: NotificationKind, ch: DeliveryChannel, on: boolean) {
		setChannels((c) => {
			const cur = c[kind] ?? ["mail"];
			const next = on
				? [...new Set([...cur, ch])]
				: cur.filter((x) => x !== ch);
			// mindestens ein Weg je Art
			return next.length === 0 ? c : { ...c, [kind]: next };
		});
	}

	function toggleAll(ch: DeliveryChannel, on: boolean) {
		setChannels((c) => {
			const out = { ...c };
			for (const k of kinds) {
				const cur = out[k.kind] ?? ["mail"];
				const next = on
					? [...new Set([...cur, ch])]
					: cur.filter((x) => x !== ch);
				out[k.kind] = next.length === 0 ? cur : next;
			}
			return out;
		});
	}

	function enablePush() {
		if (!push) return;
		setPushError(null);
		// Die Rückfrage des Browsers muss direkt auf den Klick folgen
		const permission =
			Notification.permission === "granted"
				? Promise.resolve("granted" as NotificationPermission)
				: Notification.requestPermission();
		startPush(async () => {
			try {
				if ((await permission) !== "granted") {
					setPushState(Notification.permission === "denied" ? "denied" : "off");
					return;
				}
				const reg = await navigator.serviceWorker.register("/sw.js", {
					scope: "/",
				});
				await navigator.serviceWorker.ready;
				let sub = await reg.pushManager.getSubscription();
				const key = b64urlToBytes(push.publicKey);
				const sameKey = (k: ArrayBuffer | null | undefined) =>
					Boolean(k) &&
					new Uint8Array(k as ArrayBuffer).every((b, i) => b === key[i]);
				if (sub && !sameKey(sub.options.applicationServerKey)) {
					await sub.unsubscribe();
					sub = null;
				}
				sub ??= await reg.pushManager.subscribe({
					userVisibleOnly: true,
					applicationServerKey: key,
				});
				const j = sub.toJSON();
				const res = await savePushSubscription({
					endpoint: j.endpoint,
					p256dh: j.keys?.p256dh,
					auth: j.keys?.auth,
					label: deviceLabel(),
				});
				if (!res.ok) return setPushError(pushErr(res));
				// Noch keine Art mit Push: für alle vorwählen und speichern
				if (!kinds.some((k) => selected(k.kind).includes("push"))) {
					const next = Object.fromEntries(
						kinds.map((k) => [
							k.kind,
							[...new Set([...selected(k.kind), "push" as const])],
						]),
					);
					setChannels(next);
					await saveNotificationPreferences({
						channels: next,
						digestEnabled: digest,
					});
				}
				toast.success(t("pushOn"));
				router.refresh();
			} catch (e) {
				console.error("push", e);
				setPushError(t("pushFailed"));
			}
		});
	}

	function removeDevice(d: Device) {
		setPushError(null);
		startPush(async () => {
			if (d.ref === myRef) {
				try {
					await (await currentSubscription())?.unsubscribe();
				} catch {
					// Abo im Browser schon weg: Gerät trotzdem entfernen
				}
			}
			const res = await removePushSubscription(d.id);
			if (!res.ok) return setPushError(pushErr(res));
			toast.success(t("deviceRemoved"));
			router.refresh();
		});
	}

	function test() {
		setPushError(null);
		startPush(async () => {
			const res = await sendPushTest();
			if (!res.ok) return setPushError(pushErr(res));
			if (res.data.sent === 0) return setPushError(t("testNone"));
			toast.success(t("testSent", { n: res.data.sent }));
			router.refresh();
		});
	}

	const pushStatus: Record<PushState, string> = {
		checking: t("pushChecking"),
		unsupported: t("pushUnsupported"),
		ios_home: t("pushIosHome"),
		denied: t("pushDenied"),
		off: t("pushOff"),
		on: t("pushOnHere"),
	};

	return (
		<ListGroup className="text-subhead">
			{push && (
				<ListSection
					title={t("pushTitle")}
					footer={t("pushFooter")}
					actions={
						devices.length > 0 ? (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={test}
								disabled={pushBusy}
							>
								{t("test")}
							</Button>
						) : undefined
					}
				>
					<ListRow
						title={t("thisDevice")}
						subtitle={pushStatus[pushState]}
						accessory={
							pushState === "off" ? (
								<Button
									type="button"
									size="sm"
									onClick={enablePush}
									disabled={pushBusy}
								>
									{pushBusy ? t("pushEnabling") : t("pushEnable")}
								</Button>
							) : undefined
						}
					/>
					{devices.map((d) => (
						<ListRow
							key={d.id}
							title={
								<>
									{d.label ?? t("unnamedDevice")}
									{d.ref === myRef && (
										<span className="text-muted-foreground">
											{" "}
											· {t("thisDeviceShort")}
										</span>
									)}
								</>
							}
							subtitle={[
								serviceOf(d.host),
								t("since", {
									date: format.dateTime(d.createdAt, { dateStyle: "medium" }),
								}),
								d.lastError
									? t("deliveryProblem")
									: d.lastSuccessAt
										? t("lastDelivered", {
												date: format.dateTime(d.lastSuccessAt, {
													dateStyle: "medium",
													timeStyle: "short",
												}),
											})
										: null,
							]
								.filter(Boolean)
								.join(" · ")}
							accessory={
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={() => removeDevice(d)}
									disabled={pushBusy}
								>
									{t("remove")}
								</Button>
							}
						/>
					))}
				</ListSection>
			)}
			{pushError && <FormAlert message={pushError} />}

			<form
				className="flex flex-col gap-7"
				onSubmit={(e) => {
					e.preventDefault();
					start(async () => {
						setError(null);
						const res = await saveNotificationPreferences({
							channels,
							digestEnabled: digest,
						});
						if (!res.ok) return setError(errorText(tc, res));
						toast.success(t("saved"));
						router.refresh();
					});
				}}
			>
				<ListSection footer={t("digestHint")}>
					<ListRow
						title={<label htmlFor="np-digest">{t("digest")}</label>}
						accessory={
							<Switch
								id="np-digest"
								checked={digest}
								onCheckedChange={setDigest}
							/>
						}
					/>
				</ListSection>

				{choice ? (
					<ListSection title={t("waysTitle")} footer={t("fallback")}>
						<ListRow
							title={<span className="font-medium">{t("allKinds")}</span>}
							accessory={
								<ChannelBoxes
									id="all"
									options={options}
									label={(o) => t(`channel_${o}`)}
									checked={(o) =>
										kinds.every((k) => selected(k.kind).includes(o))
									}
									disabled={() => false}
									onChange={toggleAll}
								/>
							}
						/>
						{kinds.map((k) => (
							<ListRow
								key={k.kind}
								title={<span className="hyphens-auto">{k.label}</span>}
								subtitle={k.immediate ? t("immediate") : t("inDigest")}
								accessory={
									<ChannelBoxes
										id={k.kind}
										options={options}
										label={(o) => t(`channel_${o}`)}
										checked={(o) => selected(k.kind).includes(o)}
										disabled={(o) =>
											selected(k.kind).length === 1 && selected(k.kind)[0] === o
										}
										onChange={(o, on) => toggle(k.kind, o, on)}
									/>
								}
							/>
						))}
					</ListSection>
				) : (
					<p className="px-4 text-footnote text-muted-foreground">
						{t("leadMail")}
					</p>
				)}
				<FormAlert message={error} />
				<div className="flex justify-end">
					<Button type="submit" disabled={pending}>
						{pending ? t("saving") : t("save")}
					</Button>
				</div>
			</form>
		</ListGroup>
	);
}

function ChannelBoxes({
	id,
	options,
	label,
	checked,
	disabled,
	onChange,
}: {
	id: string;
	options: DeliveryChannel[];
	label: (o: DeliveryChannel) => string;
	checked: (o: DeliveryChannel) => boolean;
	disabled: (o: DeliveryChannel) => boolean;
	onChange: (o: DeliveryChannel, on: boolean) => void;
}) {
	return (
		<span className="flex flex-wrap justify-end gap-x-4 gap-y-2">
			{options.map((o) => (
				<span key={o} className="flex items-center gap-2">
					<Checkbox
						id={`np-${id}-${o}`}
						checked={checked(o)}
						disabled={disabled(o)}
						onCheckedChange={(v) => onChange(o, v === true)}
					/>
					<label htmlFor={`np-${id}-${o}`} className="text-subhead">
						{label(o)}
					</label>
				</span>
			))}
		</span>
	);
}
