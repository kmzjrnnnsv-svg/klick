// Rate-Limit je Organisation (Noisy Neighbour): gleitendes Fenster im
// Prozessspeicher, keine Abhängigkeit. Gilt zusätzlich zu den nginx-Zonen je
// IP für die teuren Pfade (Exporte, Nachweis-Downloads, Uploads). Pure Klasse,
// getestet; die Instanz liest ORG_RATE_LIMIT_PER_MIN (0 = aus).

export type RateDecision = {
	allowed: boolean;
	remaining: number;
	retryAfterMs: number;
};

export class SlidingWindowLimiter {
	private readonly hits = new Map<string, number[]>();

	constructor(
		readonly limit: number,
		readonly windowMs: number = 60_000,
	) {}

	check(key: string, now: number = Date.now()): RateDecision {
		if (this.limit <= 0)
			return {
				allowed: true,
				remaining: Number.POSITIVE_INFINITY,
				retryAfterMs: 0,
			};
		const from = now - this.windowMs;
		const list = (this.hits.get(key) ?? []).filter((t) => t > from);
		if (list.length >= this.limit) {
			this.hits.set(key, list);
			const oldest = list[0] ?? now;
			return {
				allowed: false,
				remaining: 0,
				retryAfterMs: oldest + this.windowMs - now,
			};
		}
		list.push(now);
		this.hits.set(key, list);
		// Speicher begrenzen: Schlüssel ohne Treffer im Fenster vergessen.
		if (this.hits.size > 10_000) this.sweep(now);
		return {
			allowed: true,
			remaining: this.limit - list.length,
			retryAfterMs: 0,
		};
	}

	sweep(now: number = Date.now()): void {
		const from = now - this.windowMs;
		for (const [key, list] of this.hits) {
			const live = list.filter((t) => t > from);
			if (live.length === 0) this.hits.delete(key);
			else this.hits.set(key, live);
		}
	}

	size(): number {
		return this.hits.size;
	}
}

let orgLimiter: SlidingWindowLimiter | null = null;

export function getOrgLimiter(): SlidingWindowLimiter {
	if (!orgLimiter) {
		const perMin = Number(process.env.ORG_RATE_LIMIT_PER_MIN ?? "600");
		orgLimiter = new SlidingWindowLimiter(
			Number.isFinite(perMin) ? perMin : 600,
		);
	}
	return orgLimiter;
}

// Nur für Tests.
export function setOrgLimiterForTests(l: SlidingWindowLimiter | null): void {
	orgLimiter = l;
}
