import pino from "pino";

// Strukturiertes Logging (DORA Art. 10). Niemals aus proxy.ts importieren
// (Edge-Runtime). Redaction entfernt Tokens, Cookies, Secrets und URLs
// (Magic-Links!) aus jeder Zeile.
const level = process.env.LOG_LEVEL ?? "info";
const isDev = process.env.NODE_ENV === "development";

export const logger = pino({
	level,
	base: { service: "klick" },
	timestamp: pino.stdTimeFunctions.isoTime,
	redact: {
		paths: [
			"req.headers.authorization",
			"req.headers.cookie",
			"*.password",
			"*.token",
			"*.secret",
			"*.url",
			"*.email",
			"*.body",
		],
		censor: "[redacted]",
	},
	...(isDev
		? {
				transport: {
					target: "pino-pretty",
					options: { colorize: true, translateTime: "HH:MM:ss" },
				},
			}
		: {}),
});

export type Logger = typeof logger;

// Kind-Logger mit Request-/Org-Kontext. Enthält bewusst nur IDs, nie Payloads.
export function scopedLogger(ctx: {
	requestId?: string;
	orgId?: string | null;
	userId?: string | null;
}): Logger {
	return logger.child({
		requestId: ctx.requestId,
		orgId: ctx.orgId ?? undefined,
		userId: ctx.userId ?? undefined,
	});
}
