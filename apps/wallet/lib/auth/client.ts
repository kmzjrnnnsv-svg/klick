import { passkeyClient } from "@better-auth/passkey/client";
import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { auth } from "./server";

// Browser-Client von both.money. Nur in Client-Komponenten importieren.
export const authClient = createAuthClient({
	plugins: [passkeyClient(), inferAdditionalFields<typeof auth>()],
});
