import { open } from "node:fs/promises";
import { env } from "@/lib/env";
import {
	HOST_STATUS_MAX_BYTES,
	type HostStatus,
	parseHostStatus,
} from "./host-status";

// Statusdatei des Servers lesen (Admin > Betrieb). Nur Server; fehlt die
// Datei oder ist sie ungültig, gibt es keinen Stand (null) statt eines Fehlers.
export async function readHostStatus(): Promise<
	| { ok: true; status: HostStatus }
	| { ok: false; reason: "missing" | "invalid" }
> {
	let handle: Awaited<ReturnType<typeof open>> | null = null;
	try {
		handle = await open(env().HOST_STATUS_FILE, "r");
		const { size } = await handle.stat();
		if (size > HOST_STATUS_MAX_BYTES) return { ok: false, reason: "invalid" };
		const raw = (await handle.readFile({ encoding: "utf8" })).slice(
			0,
			HOST_STATUS_MAX_BYTES,
		);
		const status = parseHostStatus(raw);
		return status ? { ok: true, status } : { ok: false, reason: "invalid" };
	} catch {
		return { ok: false, reason: "missing" };
	} finally {
		await handle?.close();
	}
}
