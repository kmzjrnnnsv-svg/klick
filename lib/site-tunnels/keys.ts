import { generateKeyPairSync, randomBytes } from "node:crypto";

// Geheimnisse eines Standort-Tunnels erzeugen (Test site-tunnels-keys).
// IPsec: Pre-shared Key aus 32 Zufallsbytes (base64url, 43 Zeichen, ohne
// Zeichen, die Firewall-Oberflächen verschlucken). WireGuard: X25519-Paar
// der Gegenstelle + Preshared Key (base64, wie `wg genkey`/`wg genpsk`).

export type IpsecSecret = { psk: string };
export type WireguardSecret = {
	privateKey: string;
	publicKey: string;
	presharedKey: string;
};

export const newIpsecSecret = (): IpsecSecret => ({
	psk: randomBytes(32).toString("base64url"),
});

export function newWireguardSecret(): WireguardSecret {
	const { publicKey, privateKey } = generateKeyPairSync("x25519");
	const raw = (der: Buffer) => der.subarray(der.length - 32).toString("base64");
	return {
		privateKey: raw(privateKey.export({ format: "der", type: "pkcs8" })),
		publicKey: raw(publicKey.export({ format: "der", type: "spki" })),
		presharedKey: randomBytes(32).toString("base64"),
	};
}
