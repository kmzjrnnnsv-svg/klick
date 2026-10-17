import { resolveCaa, resolveTxt } from "node:dns/promises";
import type { ParsedScan } from "../types";
import {
	analyzeBundles,
	analyzeCookies,
	analyzeDns,
	analyzeHeaders,
	analyzeSecurityTxt,
	analyzeSourceMaps,
	analyzeTls,
	scriptUrls,
	sourceMapUrl,
} from "./analyze";
import { type FetchBudget, type FetchError, safeFetch } from "./fetcher";
import type { Resolver } from "./ssrf";

// Passiver Schnellcheck einer URL: höchstens 40 Anfragen in 60 Sekunden,
// nur GET auf Seite, eigene Skripte, deren Source-Maps und security.txt —
// keine Pfad-Proben (/.git, /.env), keine Formulare, keine Payloads.

export type QuickCheckDeps = {
	resolve?: Resolver;
	// Abruf ersetzbar (Tests); Standard ist der SSRF-geschützte safeFetch
	fetch?: typeof safeFetch;
	txt?: (name: string) => Promise<string[] | null>;
	caa?: (name: string) => Promise<boolean | null>;
	now?: Date;
};

const txtRecords = async (name: string) => {
	try {
		return (await resolveTxt(name)).map((r) => r.join(""));
	} catch (e) {
		const code = (e as { code?: string }).code;
		return code === "ENODATA" || code === "ENOTFOUND" ? [] : null;
	}
};
const hasCaa = async (name: string) => {
	try {
		return (await resolveCaa(name)).length > 0;
	} catch (e) {
		const code = (e as { code?: string }).code;
		return code === "ENODATA" || code === "ENOTFOUND" ? false : null;
	}
};

// grob die registrierbare Domain (zwei Labels; Mehrfach-TLDs wie co.uk mit drei)
export function baseDomain(host: string): string {
	const parts = host.replace(/\.$/, "").split(".");
	const multi = /^(co|com|org|net|gov|ac)\.[a-z]{2}$/i.test(
		parts.slice(-2).join("."),
	);
	return parts.slice(multi ? -3 : -2).join(".");
}

export async function runQuickCheck(
	rawUrl: string,
	deps: QuickCheckDeps = {},
): Promise<
	| { ok: true; scan: ParsedScan; finalUrl: string; requests: number }
	| { ok: false; error: FetchError }
> {
	const now = deps.now ?? new Date();
	const budget: FetchBudget = { requests: 40, deadline: Date.now() + 60_000 };
	const get = deps.fetch ?? safeFetch;
	const main = await get(rawUrl, { budget, resolve: deps.resolve });
	if (!main.ok) return main;
	const page = main.res;
	const finalUrl = page.url;
	const findings = [
		...analyzeHeaders(finalUrl, page.headers),
		...analyzeCookies(
			finalUrl,
			([] as string[]).concat(page.headers["set-cookie"] ?? []),
		),
		...analyzeTls(finalUrl, page.tls, now),
	];

	const bundles: { url: string; text: string }[] = [];
	const maps: { url: string; exposed: boolean }[] = [];
	for (const src of scriptUrls(page.body, finalUrl)) {
		const r = await get(src, {
			budget,
			resolve: deps.resolve,
			maxBytes: 3 * 1024 * 1024,
		});
		if (!r.ok) {
			if (r.error === "budget") break;
			continue;
		}
		if (r.res.status !== 200) continue;
		bundles.push({ url: src, text: r.res.body });
		const map = sourceMapUrl(r.res.body, src);
		if (map && maps.length < 5) {
			const m = await get(map, {
				budget,
				resolve: deps.resolve,
				maxBytes: 64 * 1024,
			});
			maps.push({
				url: map,
				exposed: m.ok && m.res.status === 200 && /^\s*\{/.test(m.res.body),
			});
		}
	}
	findings.push(...analyzeBundles(bundles), ...analyzeSourceMaps(maps));

	const origin = new URL(finalUrl).origin;
	const sec = await get(`${origin}/.well-known/security.txt`, {
		budget,
		resolve: deps.resolve,
		maxBytes: 32 * 1024,
	});
	findings.push(
		...analyzeSecurityTxt(
			`${origin}/.well-known/security.txt`,
			sec.ok ? { status: sec.res.status, body: sec.res.body } : null,
			now,
		),
	);

	const domain = baseDomain(new URL(finalUrl).hostname);
	const [txt, dmarc, caa] = await Promise.all([
		(deps.txt ?? txtRecords)(domain),
		(deps.txt ?? txtRecords)(`_dmarc.${domain}`),
		(deps.caa ?? hasCaa)(domain),
	]);
	findings.push(...analyzeDns(domain, { txt, dmarc, caa }));

	return {
		ok: true,
		scan: {
			tool: "quick_check",
			toolName: "Klick-Schnellcheck",
			target: origin,
			findings,
		},
		finalUrl,
		requests: 40 - budget.requests,
	};
}
