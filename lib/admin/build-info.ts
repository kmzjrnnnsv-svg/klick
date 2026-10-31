// Build-Stand aus next.config.ts (env zur Build-Zeit eingesetzt). Nur Server.
export type BuildInfo = {
	commit: string | null;
	tag: string | null;
	builtAt: Date | null;
};

export function buildInfo(): BuildInfo {
	const at = process.env.KLICK_BUILD_AT;
	const builtAt = at ? new Date(at) : null;
	return {
		commit: process.env.KLICK_BUILD_COMMIT || null,
		tag: process.env.KLICK_BUILD_TAG || null,
		builtAt: builtAt && !Number.isNaN(builtAt.getTime()) ? builtAt : null,
	};
}
