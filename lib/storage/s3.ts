import {
	DeleteObjectCommand,
	DeleteObjectsCommand,
	GetObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";

if (!process.env.S3_ENDPOINT) throw new Error("S3_ENDPOINT missing");
if (!process.env.S3_ACCESS_KEY_ID) throw new Error("S3_ACCESS_KEY_ID missing");
if (!process.env.S3_SECRET_ACCESS_KEY) {
	throw new Error("S3_SECRET_ACCESS_KEY missing");
}

export const BUCKET = process.env.S3_BUCKET ?? "klick";

export const s3 = new S3Client({
	endpoint: process.env.S3_ENDPOINT,
	region: process.env.S3_REGION ?? "us-east-1",
	credentials: {
		accessKeyId: process.env.S3_ACCESS_KEY_ID,
		secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
	},
	forcePathStyle: true, // required for MinIO
});

export async function putBytes(key: string, body: Uint8Array): Promise<void> {
	await s3.send(
		new PutObjectCommand({
			Bucket: BUCKET,
			Key: key,
			Body: body,
			ContentType: "application/octet-stream",
		}),
	);
}

export async function getBytes(key: string): Promise<Uint8Array> {
	const out = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
	if (!out.Body) throw new Error(`empty body for ${key}`);
	return new Uint8Array(await out.Body.transformToByteArray());
}

export async function deleteObject(key: string): Promise<void> {
	await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

// Alle Objekte unter einem Präfix (Org-Löschung: org/<orgId>/).
export async function listKeys(prefix: string): Promise<string[]> {
	const keys: string[] = [];
	let token: string | undefined;
	do {
		const out = await s3.send(
			new ListObjectsV2Command({
				Bucket: BUCKET,
				Prefix: prefix,
				ContinuationToken: token,
			}),
		);
		for (const o of out.Contents ?? []) if (o.Key) keys.push(o.Key);
		token = out.IsTruncated ? out.NextContinuationToken : undefined;
	} while (token);
	return keys;
}

export async function deleteObjects(keys: readonly string[]): Promise<number> {
	let deleted = 0;
	for (let i = 0; i < keys.length; i += 1000) {
		const chunk = keys.slice(i, i + 1000);
		const out = await s3.send(
			new DeleteObjectsCommand({
				Bucket: BUCKET,
				Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
			}),
		);
		deleted += chunk.length - (out.Errors?.length ?? 0);
	}
	return deleted;
}
