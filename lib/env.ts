import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

// Files are loaded in priority order. dotenv is idempotent — the first file
// that defines a variable wins, later loads do not overwrite it. Production
// systemd already exports the env, but interactive shell sessions running
// `pnpm db:migrate` need to find the same values, hence `.env.production`.
const ENV_FILES = [".env.local", ".env.production", ".env"] as const;

let loaded = false;

export function loadEnvFiles(): { loaded: string[] } {
	const found: string[] = [];
	for (const file of ENV_FILES) {
		const path = resolve(process.cwd(), file);
		if (existsSync(path)) {
			config({ path });
			found.push(file);
		}
	}
	loaded = true;
	return { loaded: found };
}

export function ensureEnvLoaded(): void {
	if (!loaded) loadEnvFiles();
}
