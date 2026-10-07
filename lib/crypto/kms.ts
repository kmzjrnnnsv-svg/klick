import sodium from "libsodium-wrappers";

// KEK-Verwaltung hinter einem Interface. Heute: LocalKms mit Schlüsseln aus
// systemd-Credentials/Env (VAULT_KEK_BASE64, VAULT_KEK_BASE64_V2, …). Ab
// Lizenzstufe 2: HSM/KMS-Implementierung (Utimaco, Thales, OpenBao) — gleiche
// Schnittstelle, eine Datei, kein Rewrite. ISO A.8.24, MiCAR Art. 70.

export type WrappedDek = {
	keyVersion: number;
	// base64(nonce || ciphertext), AEAD mit aad = "klick:dek:v<keyVersion>"
	wrapped: string;
};

export interface Kms {
	readonly currentKeyVersion: number;
	wrap(dek: Uint8Array): Promise<WrappedDek>;
	unwrap(wrapped: WrappedDek): Promise<Uint8Array>;
}

function decodeKey(b64: string, label: string): Uint8Array {
	const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
	if (bytes.length !== 32) {
		throw new Error(`${label} muss 32 Byte (base64) sein, hat ${bytes.length}`);
	}
	return bytes;
}

export class LocalKms implements Kms {
	readonly currentKeyVersion: number;
	private readonly keys = new Map<number, Uint8Array>();

	constructor(keys: Map<number, Uint8Array>, currentKeyVersion: number) {
		if (!keys.has(currentKeyVersion)) {
			throw new Error(`KEK-Version ${currentKeyVersion} nicht konfiguriert`);
		}
		this.keys = keys;
		this.currentKeyVersion = currentKeyVersion;
	}

	// Liest VAULT_KEK_BASE64 (Version VAULT_KEK_VERSION, default 1) sowie
	// VAULT_KEK_BASE64_V<n> für ältere/neuere Versionen (Rotation).
	static fromEnv(
		source: Record<string, string | undefined> = process.env,
	): LocalKms {
		const keys = new Map<number, Uint8Array>();
		const currentVersion = Number(source.VAULT_KEK_VERSION ?? "1");
		if (!source.VAULT_KEK_BASE64) {
			throw new Error("VAULT_KEK_BASE64 fehlt");
		}
		keys.set(
			currentVersion,
			decodeKey(source.VAULT_KEK_BASE64, "VAULT_KEK_BASE64"),
		);
		for (const [name, value] of Object.entries(source)) {
			const m = /^VAULT_KEK_BASE64_V(\d+)$/.exec(name);
			if (m && value) keys.set(Number(m[1]), decodeKey(value, name));
		}
		return new LocalKms(keys, currentVersion);
	}

	async wrap(dek: Uint8Array): Promise<WrappedDek> {
		await sodium.ready;
		const kek = this.keys.get(this.currentKeyVersion);
		if (!kek) throw new Error("KEK fehlt");
		const nonce = sodium.randombytes_buf(
			sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES,
		);
		const aad = sodium.from_string(`klick:dek:v${this.currentKeyVersion}`);
		const ct = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
			dek,
			aad,
			null,
			nonce,
			kek,
		);
		const out = new Uint8Array(nonce.length + ct.length);
		out.set(nonce, 0);
		out.set(ct, nonce.length);
		return {
			keyVersion: this.currentKeyVersion,
			wrapped: Buffer.from(out).toString("base64"),
		};
	}

	async unwrap(wrapped: WrappedDek): Promise<Uint8Array> {
		await sodium.ready;
		const kek = this.keys.get(wrapped.keyVersion);
		if (!kek) {
			throw new Error(`KEK-Version ${wrapped.keyVersion} nicht verfügbar`);
		}
		const bytes = Uint8Array.from(Buffer.from(wrapped.wrapped, "base64"));
		const n = sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES;
		const nonce = bytes.slice(0, n);
		const ct = bytes.slice(n);
		const aad = sodium.from_string(`klick:dek:v${wrapped.keyVersion}`);
		try {
			return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
				null,
				ct,
				aad,
				nonce,
				kek,
			);
		} catch {
			throw new Error(
				"DEK-Unwrap fehlgeschlagen (falscher KEK oder manipuliert)",
			);
		}
	}
}

let cached: Kms | null = null;

export function getKms(): Kms {
	if (!cached) cached = LocalKms.fromEnv();
	return cached;
}

// Nur für Tests.
export function setKmsForTests(kms: Kms | null): void {
	cached = kms;
}
