import {
	constants,
	createHash,
	createPrivateKey,
	randomUUID,
	sign,
} from "node:crypto";
import type { MsHttpRequest } from "./http";

// Token für Microsoft Graph über Client-Credentials (Teams, Identität):
// Zertifikat per signierter Assertion bevorzugt (PS256 mit x5t#S256, nie
// SHA-1), Geheimnis nur als Notweg.

const LOGIN = "https://login.microsoftonline.com";

export type MsCredential =
	| { kind: "certificate"; pem: string }
	| { kind: "secret"; secret: string };

export type MsAppConfig = { clientId: string; credential: MsCredential };

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

function pemBlock(pem: string, label: RegExp): string | null {
	const m = pem.match(
		new RegExp(`-----BEGIN (${label.source})-----[\\s\\S]+?-----END \\1-----`),
	);
	return m ? m[0] : null;
}

// Signierte Client-Assertion (RFC 7523) für die Anmeldung mit Zertifikat
export function clientAssertion(
	clientId: string,
	tenantId: string,
	pem: string,
	nowMs: number,
	jti: string = randomUUID(),
): string {
	const cert = pemBlock(pem, /CERTIFICATE/);
	const key = pemBlock(pem, /(?:RSA |EC |ENCRYPTED )?PRIVATE KEY/);
	if (!cert || !key) throw new Error("ms_cert_invalid");
	const der = Buffer.from(
		cert.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""),
		"base64",
	);
	// PS256 mit SHA-256-Fingerabdruck (x5t#S256, RFC 7515 4.1.8), wie
	// Microsoft es für Zertifikats-Assertions empfiehlt; kein SHA-1 (x5t).
	const header = {
		alg: "PS256",
		typ: "JWT",
		"x5t#S256": b64url(createHash("sha256").update(der).digest()),
	};
	const now = Math.floor(nowMs / 1000);
	const payload = {
		aud: `${LOGIN}/${tenantId}/oauth2/v2.0/token`,
		iss: clientId,
		sub: clientId,
		jti,
		nbf: now - 30,
		exp: now + 600,
	};
	const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
	const sig = sign("sha256", Buffer.from(data), {
		key: createPrivateKey(key),
		padding: constants.RSA_PKCS1_PSS_PADDING,
		saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
	});
	return `${data}.${b64url(sig)}`;
}

export function msTokenRequest(
	config: MsAppConfig,
	tenantId: string,
	nowMs: number,
): MsHttpRequest {
	const form = new URLSearchParams({
		client_id: config.clientId,
		scope: "https://graph.microsoft.com/.default",
		grant_type: "client_credentials",
	});
	if (config.credential.kind === "certificate") {
		form.set(
			"client_assertion_type",
			"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
		);
		form.set(
			"client_assertion",
			clientAssertion(config.clientId, tenantId, config.credential.pem, nowMs),
		);
	} else form.set("client_secret", config.credential.secret);
	return {
		method: "POST",
		url: `${LOGIN}/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: form.toString(),
	};
}
