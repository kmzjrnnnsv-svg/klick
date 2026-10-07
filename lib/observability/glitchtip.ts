// Fehler-Tracking nach GlitchTip/Sentry (self-hosted auf Hetzner) über die
// Store-API — ohne SDK-Abhängigkeit. Aktiv, sobald GLITCHTIP_DSN gesetzt ist.
// PII-Scrubbing vor dem Versand: E-Mails, Tokens, Query-Strings, Cookies,
// Authorization, lange Hex-/Base64-Werte. Nie Request-Bodies, nie Magic-Links.

export type Dsn = {
	protocol: string;
	host: string;
	publicKey: string;
	projectId: string;
};

export function parseDsn(dsn: string): Dsn | null {
	try {
		const u = new URL(dsn);
		const projectId = u.pathname.replace(/^\/+/, "").split("/").pop() ?? "";
		if (!u.username || !projectId) return null;
		return {
			protocol: u.protocol.replace(":", ""),
			host: u.host,
			publicKey: u.username,
			projectId,
		};
	} catch {
		return null;
	}
}

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const LONG_SECRET = /\b[A-Za-z0-9_-]{32,}\b/g;
const QUERY = /\?[^\s"']*/g;

export function scrubText(s: string): string {
	return s
		.replaceAll(EMAIL, "[email]")
		.replaceAll(QUERY, "?[query]")
		.replaceAll(LONG_SECRET, "[secret]");
}

const DROP_KEYS = new Set([
	"cookie",
	"authorization",
	"set-cookie",
	"x-api-key",
	"password",
	"token",
	"secret",
	"body",
	"email",
]);

export function scrubValue(v: unknown, depth = 0): unknown {
	if (depth > 6) return "[depth]";
	if (typeof v === "string") return scrubText(v);
	if (Array.isArray(v)) return v.map((x) => scrubValue(x, depth + 1));
	if (v && typeof v === "object") {
		const out: Record<string, unknown> = {};
		for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
			if (DROP_KEYS.has(k.toLowerCase())) {
				out[k] = "[redacted]";
				continue;
			}
			out[k] = scrubValue(val, depth + 1);
		}
		return out;
	}
	return v;
}

export type ErrorContext = {
	path?: string;
	method?: string;
	routeType?: string;
	routePath?: string;
	requestId?: string;
	orgId?: string | null;
	release?: string;
	environment?: string;
};

export type SentryEvent = {
	event_id: string;
	timestamp: string;
	platform: "node";
	level: "error";
	logger: string;
	environment: string;
	release?: string;
	server_name?: string;
	tags: Record<string, string>;
	request?: { url?: string; method?: string };
	exception: {
		values: {
			type: string;
			value: string;
			stacktrace?: {
				frames: { filename: string; function?: string; lineno?: number }[];
			};
		}[];
	};
};

function parseStack(stack: string | undefined) {
	if (!stack) return undefined;
	const frames = stack
		.split("\n")
		.slice(1)
		.map((line) => line.trim())
		.filter((l) => l.startsWith("at "))
		.map((l) => {
			const m = /^at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/.exec(l);
			return m
				? {
						function: m[1] ?? undefined,
						filename: scrubText(m[2] ?? ""),
						lineno: Number(m[3]),
					}
				: { filename: scrubText(l) };
		})
		.reverse()
		.slice(-50);
	return frames.length > 0 ? { frames } : undefined;
}

export function buildEvent(
	err: unknown,
	ctx: ErrorContext,
	now: Date = new Date(),
): SentryEvent {
	const e = err instanceof Error ? err : new Error(String(err));
	const digest = (e as Error & { digest?: string }).digest;
	return {
		event_id: crypto.randomUUID().replaceAll("-", ""),
		timestamp: now.toISOString(),
		platform: "node",
		level: "error",
		logger: "klick",
		environment: ctx.environment ?? process.env.NODE_ENV ?? "development",
		...(ctx.release ? { release: ctx.release } : {}),
		tags: {
			...(ctx.routeType ? { routeType: ctx.routeType } : {}),
			...(ctx.routePath ? { routePath: scrubText(ctx.routePath) } : {}),
			...(ctx.requestId ? { requestId: ctx.requestId } : {}),
			...(ctx.orgId ? { orgId: ctx.orgId } : {}),
			...(digest ? { digest } : {}),
		},
		request: {
			...(ctx.path ? { url: scrubText(ctx.path) } : {}),
			...(ctx.method ? { method: ctx.method } : {}),
		},
		exception: {
			values: [
				{
					type: e.name || "Error",
					value: scrubText(e.message).slice(0, 1000),
					stacktrace: parseStack(e.stack),
				},
			],
		},
	};
}

export function storeUrl(dsn: Dsn): string {
	return `${dsn.protocol}://${dsn.host}/api/${dsn.projectId}/store/`;
}

export function authHeader(dsn: Dsn, now: Date = new Date()): string {
	return `Sentry sentry_version=7, sentry_client=klick/1.0, sentry_timestamp=${Math.floor(now.getTime() / 1000)}, sentry_key=${dsn.publicKey}`;
}

// Fire-and-forget; Fehler beim Versand werden verschluckt (nie den Request stören).
export async function captureException(
	err: unknown,
	ctx: ErrorContext = {},
): Promise<boolean> {
	const raw = process.env.GLITCHTIP_DSN;
	if (!raw) return false;
	const dsn = parseDsn(raw);
	if (!dsn) return false;
	const event = buildEvent(err, {
		release: process.env.KLICK_RELEASE,
		...ctx,
	});
	try {
		const res = await fetch(storeUrl(dsn), {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Sentry-Auth": authHeader(dsn),
			},
			body: JSON.stringify(event),
			signal: AbortSignal.timeout(5_000),
		});
		return res.ok;
	} catch {
		return false;
	}
}
