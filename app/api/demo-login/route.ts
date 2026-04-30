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

	const isSecure = req.nextUrl.protocol === "https:";
	const cookieName = isSecure
		? "__Secure-authjs.session-token"
		: "authjs.session-token";

	const res = NextResponse.redirect(new URL("/post-login", req.url));
	res.cookies.set(cookieName, sessionToken, {
		path: "/",
		httpOnly: true,
		sameSite: "lax",
		secure: isSecure,
		expires,
	});
	return res;
}
