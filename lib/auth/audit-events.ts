import { APIError, createAuthMiddleware } from "better-auth/api";
import { eq } from "drizzle-orm";
import { globalDb } from "@/db";
import { session as sessionTable } from "@/db/auth-schema";
import { type Actor, auditPlatform } from "@/lib/audit";
import { ipFromHeaders } from "./session-rules";

// Auth-Ereignisse → Audit-Log (ISO A.8.15, DORA Art. 10). Eine Middleware
// mit Pfad-Switch; Logins selbst protokolliert databaseHooks.session.create
// (zuverlässig für alle Login-Methoden), hier landen Fehlschläge, MFA-,
// Admin- und Sitzungs-Ereignisse. Niemals E-Mail-Adressen oder Tokens.

export { ipFromHeaders } from "./session-rules";

export const authAfterHook = createAuthMiddleware(async (ctx) => {
	const path = ctx.path;
	const failed = ctx.context.returned instanceof APIError;
	const newSession = ctx.context.newSession;
	const current = ctx.context.session;
	const actor: Actor = {
		userId: newSession?.user.id ?? current?.user.id ?? null,
		ip: ipFromHeaders(ctx.headers),
		userAgent: ctx.headers?.get("user-agent") ?? null,
	};
	const outcome = failed ? "failure" : "success";

	try {
		if (
			path === "/two-factor/verify-totp" ||
			path === "/two-factor/verify-backup-code"
		) {
			const method = path.endsWith("totp") ? "totp" : "backup_code";
			// Mit 2FA-Cookie (Passwort-Login) legt das Plugin eine neue Session an;
			// bei bestehender Session (Magic-Link, Passkey, Enrolment) bestätigt es
			// nur den Code und behält die aktuelle Session — beide Fälle zählen.
			const verified = newSession ?? current;
			if (!failed && verified) {
				// MFA-Pflicht ist unsere Regel: erst jetzt gilt die Session als
				// zweitfaktor-verifiziert (lib/auth/guards.ts prüft mfaVerifiedAt).
				const now = new Date();
				await globalDb
					.update(sessionTable)
					.set({ mfaVerifiedAt: now, lastActiveAt: now })
					.where(eq(sessionTable.token, verified.session.token));
				await auditPlatform(actor, {
					action: "auth.2fa_verified",
					target: `session:${verified.session.id}`,
					after: { method },
				});
			} else {
				await auditPlatform(actor, {
					action: "auth.2fa_failed",
					outcome: "failure",
					after: { method },
				});
			}
			return;
		}

		if (path === "/two-factor/enable" || path === "/two-factor/disable") {
			await auditPlatform(actor, {
				action: path.endsWith("enable")
					? "auth.2fa_enabled"
					: "auth.2fa_disabled",
				outcome,
			});
			return;
		}

		if (path === "/sign-in/magic-link") {
			// Anfrage: kein Erfolg/Fehler nach außen unterscheidbar (Enumeration),
			// intern aber protokolliert.
			await auditPlatform(actor, {
				action: "auth.magic_link_requested",
				outcome,
			});
			return;
		}

		if (
			path === "/sso/register" ||
			path === "/sso/update-provider" ||
			path === "/sso/delete-provider" ||
			path === "/sso/request-domain-verification" ||
			path === "/sso/verify-domain"
		) {
			await auditPlatform(actor, {
				action: `sso.${path.slice("/sso/".length).replaceAll("-", "_")}`,
				outcome,
			});
			return;
		}

		if (
			failed &&
			(path === "/magic-link/verify" ||
				path === "/sign-in/social" ||
				path === "/sign-in/sso" ||
				path.startsWith("/sso/callback") ||
				path.startsWith("/callback/") ||
				path === "/passkey/verify-authentication" ||
				path === "/sign-in/passkey")
		) {
			await auditPlatform(actor, {
				action: "auth.signin_failed",
				outcome: "failure",
				after: { path },
			});
			return;
		}

		if (path === "/sign-out") {
			await auditPlatform(actor, {
				action: "auth.signout",
				target: current ? `session:${current.session.id}` : null,
				outcome,
			});
			return;
		}

		if (
			path === "/revoke-session" ||
			path === "/revoke-sessions" ||
			path === "/revoke-other-sessions"
		) {
			await auditPlatform(actor, {
				action: "auth.session_revoked",
				after: { path },
				outcome,
			});
			return;
		}

		if (path === "/change-email") {
			await auditPlatform(actor, {
				action: "auth.email_change_requested",
				outcome,
			});
			return;
		}

		if (path.startsWith("/admin/")) {
			const body = (ctx.body ?? {}) as Record<string, unknown>;
			const targetUser = typeof body.userId === "string" ? body.userId : null;
			await auditPlatform(actor, {
				action: `admin.${path.slice("/admin/".length).replace(/-/g, "_")}`,
				target: targetUser ? `user:${targetUser}` : null,
				after: {
					role: typeof body.role === "string" ? body.role : undefined,
					banReason:
						typeof body.banReason === "string" ? body.banReason : undefined,
				},
				outcome,
			});
			return;
		}

		if (path === "/organization/set-active") {
			const body = (ctx.body ?? {}) as Record<string, unknown>;
			await auditPlatform(actor, {
				action: "org.set_active",
				target:
					typeof body.organizationId === "string"
						? `organization:${body.organizationId}`
						: null,
				outcome,
			});
		}
	} catch (err) {
		// Audit darf den Auth-Flow nie blockieren; der Fehler wird geloggt.
		console.error("[audit] auth hook failed", err);
	}
});
