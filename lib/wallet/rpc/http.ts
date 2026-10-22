// JSON-RPC über HTTP zu den eigenen Knoten (Bitcoin Core, Reth). Feste URLs
// aus der Umgebung (lib/env.ts), nur über WireGuard erreichbar — kein
// Dienstleister, kein SSRF-Pfad (Ziele kommen nie aus Eingaben).
// Zugangsdaten in der URL werden zum Basic-Auth-Header und tauchen in keiner
// Fehlermeldung auf.

export type RpcEndpoint = {
	url: string;
	headers: Record<string, string>;
	// sichere Bezeichnung für Logs (Host ohne Zugangsdaten)
	label: string;
};

export type RpcErrorCode =
	| "http"
	| "timeout"
	| "size"
	| "parse"
	| "rpc"
	| "unreachable";

export class RpcError extends Error {
	constructor(
		readonly code: RpcErrorCode,
		message: string,
		readonly rpcCode?: number,
	) {
		super(message);
		this.name = "RpcError";
	}
}

const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;

export function endpointFrom(raw: string): RpcEndpoint {
	const u = new URL(raw);
	if (u.protocol !== "http:" && u.protocol !== "https:")
		throw new Error("RPC-URL muss http(s) sein");
	const headers: Record<string, string> = {
		"content-type": "application/json",
	};
	if (u.username || u.password) {
		const user = decodeURIComponent(u.username);
		const pass = decodeURIComponent(u.password);
		headers.authorization = `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
		u.username = "";
		u.password = "";
	}
	return { url: u.toString().replace(/\/$/, ""), headers, label: u.host };
}

// JSON lesen, ohne Beträge über Float zu runden: Zahlen unter den genannten
// Schlüsseln bleiben ihr Quelltext (Bitcoin Core liefert BTC-Beträge als
// JSON-Zahl mit 8 Nachkommastellen). Braucht JSON.parse mit `context.source`
// (Node ≥ 21).
export function parseJsonExact(
	text: string,
	exactKeys: ReadonlySet<string>,
): unknown {
	return JSON.parse(
		text,
		(key: string, value: unknown, context?: { source?: string }) => {
			if (typeof value === "number" && exactKeys.has(key)) {
				if (typeof context?.source !== "string")
					throw new RpcError("parse", "JSON source text access fehlt");
				return context.source;
			}
			return value;
		},
	);
}

export type FetchLike = (
	url: string,
	init: {
		method: string;
		headers: Record<string, string>;
		body: string;
		signal: AbortSignal;
	},
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export type RpcOptions = {
	version?: "1.0" | "2.0";
	timeoutMs?: number;
	exactKeys?: ReadonlySet<string>;
	path?: string;
	fetchImpl?: FetchLike;
};

type RpcResponse = {
	id: number | string | null;
	result?: unknown;
	error?: { code: number; message: string } | null;
};

let nextId = 1;

async function post(
	ep: RpcEndpoint,
	body: unknown,
	opts: RpcOptions,
): Promise<unknown> {
	const doFetch = opts.fetchImpl ?? (fetch as unknown as FetchLike);
	let res: Awaited<ReturnType<FetchLike>>;
	try {
		res = await doFetch(`${ep.url}${opts.path ?? ""}`, {
			method: "POST",
			headers: ep.headers,
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
		});
	} catch (e) {
		const name = e instanceof Error ? e.name : "";
		throw new RpcError(
			name === "TimeoutError" || name === "AbortError"
				? "timeout"
				: "unreachable",
			`${ep.label}: ${name || "Verbindung fehlgeschlagen"}`,
		);
	}
	const text = await res.text();
	if (text.length > MAX_RESPONSE_BYTES)
		throw new RpcError("size", `${ep.label}: Antwort zu groß`);
	let parsed: unknown;
	try {
		parsed = parseJsonExact(text, opts.exactKeys ?? new Set());
	} catch {
		// Bitcoin Core antwortet bei RPC-Fehlern mit HTTP 500 und JSON —
		// nur wenn kein JSON kommt, zählt der HTTP-Status
		throw new RpcError(
			res.ok ? "parse" : "http",
			`${ep.label}: ${res.ok ? "keine gültige JSON-Antwort" : `HTTP ${res.status}`}`,
		);
	}
	return parsed;
}

function unwrap<T>(r: RpcResponse, method: string, label: string): T {
	if (r.error)
		throw new RpcError(
			"rpc",
			`${label} ${method}: ${r.error.message}`,
			r.error.code,
		);
	return r.result as T;
}

export async function rpcCall<T>(
	ep: RpcEndpoint,
	method: string,
	params: unknown[],
	opts: RpcOptions = {},
): Promise<T> {
	const id = nextId++;
	const parsed = (await post(
		ep,
		{ jsonrpc: opts.version ?? "2.0", id, method, params },
		opts,
	)) as RpcResponse;
	if (!parsed || typeof parsed !== "object")
		throw new RpcError("parse", `${ep.label} ${method}: leere Antwort`);
	return unwrap<T>(parsed, method, ep.label);
}

// Mehrere Aufrufe in einer HTTP-Anfrage; Ergebnisse in Aufrufreihenfolge.
export async function rpcBatch<T>(
	ep: RpcEndpoint,
	calls: readonly { method: string; params: unknown[] }[],
	opts: RpcOptions = {},
): Promise<T[]> {
	if (calls.length === 0) return [];
	const ids = calls.map(() => nextId++);
	const parsed = await post(
		ep,
		calls.map((c, i) => ({
			jsonrpc: opts.version ?? "2.0",
			id: ids[i],
			method: c.method,
			params: c.params,
		})),
		opts,
	);
	if (!Array.isArray(parsed))
		throw new RpcError("parse", `${ep.label}: Batch-Antwort ist keine Liste`);
	const byId = new Map(
		(parsed as RpcResponse[]).map((r) => [Number(r.id), r] as const),
	);
	return calls.map((c, i) => {
		const r = byId.get(ids[i] as number);
		if (!r) throw new RpcError("parse", `${ep.label} ${c.method}: fehlt`);
		return unwrap<T>(r, c.method, ep.label);
	});
}

// Wie rpcBatch, aber Fehler je Aufruf statt Abbruch (z. B. Runden, die ein
// Vertrag nicht kennt)
export async function rpcBatchSettled<T>(
	ep: RpcEndpoint,
	calls: readonly { method: string; params: unknown[] }[],
	opts: RpcOptions = {},
): Promise<({ ok: true; result: T } | { ok: false; error: RpcError })[]> {
	if (calls.length === 0) return [];
	const ids = calls.map(() => nextId++);
	const parsed = await post(
		ep,
		calls.map((c, i) => ({
			jsonrpc: opts.version ?? "2.0",
			id: ids[i],
			method: c.method,
			params: c.params,
		})),
		opts,
	);
	if (!Array.isArray(parsed))
		throw new RpcError("parse", `${ep.label}: Batch-Antwort ist keine Liste`);
	const byId = new Map(
		(parsed as RpcResponse[]).map((r) => [Number(r.id), r] as const),
	);
	return calls.map((c, i) => {
		const r = byId.get(ids[i] as number);
		try {
			if (!r) throw new RpcError("parse", `${ep.label} ${c.method}: fehlt`);
			return { ok: true as const, result: unwrap<T>(r, c.method, ep.label) };
		} catch (e) {
			return { ok: false as const, error: e as RpcError };
		}
	});
}
