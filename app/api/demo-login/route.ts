import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";

const DEMO_EMAILS = {
	admin: "admin@klick.local",
	company: "company@klick.local",
	headhunter: "headhunter@klick.local",
	candidate: "candidate@klick.local",
} as const;

type DemoRole = keyof typeof DEMO_EMAILS;

const SESSION_DAYS = 30;

// Backdoor login for demo / dev use.
// Triple-gated: must be opted in via ENABLE_DEMO_LOGIN, the requested role
// must map to a seeded user, and the user must already exist in the DB
// (we never create accounts here — that stays a seed-time concern).
export async function GET(req: NextRequest) {
	if (process.env.ENABLE_DEMO_LOGIN !== "true") {
		return new NextResponse("not found", { status: 404 });
	}

	const role = req.nextUrl.searchParams.get("role") as DemoRole | null;
	if (!role || !(role in DEMO_EMAILS)) {
		return NextResponse.json(
			{
				error: "missing or invalid 'role'",
				allowed: Object.keys(DEMO_EMAILS),
			},
			{ status: 400 },
		);
	}

	const email = DEMO_EMAILS[role];
	const [user] = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.email, email))
		.limit(1);
	if (!user) {
		return NextResponse.json(
			{ error: `demo user not seeded: ${email}. Run pnpm db:seed.` },
			{ status: 412 },
		);
	}

	const sessionToken = crypto.randomUUID();
	const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
	await db.insert(sessions).values({
		sessionToken,
		userId: user.id,
		expires,
	});

	// Build the redirect against the public base URL — req.url reflects the
	// internal listener (localhost:3000) when running behind a proxy.
	// AUTH_URL is set to the canonical https://… origin in production.
	const forwardedProto = req.headers.get("x-forwarded-proto");
	const forwardedHost =
		req.headers.get("x-forwarded-host") ?? req.headers.get("host");
	const baseUrl =
		process.env.AUTH_URL ??
		(forwardedProto && forwardedHost
			? `${forwardedProto}://${forwardedHost}`
			: new URL(req.url).origin);

	const isSecure = baseUrl.startsWith("https://");
	const cookieName = isSecure
		? "__Secure-authjs.session-token"
		: "authjs.session-token";

	const res = NextResponse.redirect(new URL("/post-login", baseUrl));
	res.cookies.set(cookieName, sessionToken, {
		path: "/",
		httpOnly: true,
		sameSite: "lax",
		secure: isSecure,
		expires,
	});
	return res;
}
