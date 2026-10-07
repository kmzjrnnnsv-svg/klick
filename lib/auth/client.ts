import { passkeyClient } from "@better-auth/passkey/client";
import { ssoClient } from "@better-auth/sso/client";
import {
	adminClient,
	inferAdditionalFields,
	magicLinkClient,
	organizationClient,
	twoFactorClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { ac, roles } from "./permissions";
import type { auth } from "./server";

// Browser-Client. Nur in Client-Komponenten importieren.
export const authClient = createAuthClient({
	plugins: [
		magicLinkClient(),
		organizationClient({ ac, roles }),
		twoFactorClient({
			onTwoFactorRedirect() {
				window.location.assign("/login/2fa");
			},
		}),
		passkeyClient(),
		ssoClient(),
		adminClient(),
		inferAdditionalFields<typeof auth>(),
	],
});

export type AuthClient = typeof authClient;
