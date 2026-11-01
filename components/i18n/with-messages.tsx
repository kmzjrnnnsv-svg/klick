import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import type { ComponentType, ReactNode } from "react";
import { type MessageNamespace, pickMessages } from "@/lib/i18n/messages";

// Seite mit eigenen Texten für ihre Client-Bausteine: der Provider ersetzt
// den des Root-Layouts (next-intl mischt nicht), deshalb nennt die Liste
// alle Namespaces, die unter der Seite im Browser gebraucht werden — auch
// Common. Die Liste prüft der Test `client-messages`.
export function withMessages<P>(
	Page: (props: P) => ReactNode | Promise<ReactNode>,
	namespaces: readonly MessageNamespace[],
) {
	const Inner = Page as unknown as ComponentType<P & object>;
	return async function PageWithMessages(props: P) {
		const messages = await getMessages();
		return (
			<NextIntlClientProvider messages={pickMessages(messages, namespaces)}>
				<Inner {...(props as P & object)} />
			</NextIntlClientProvider>
		);
	};
}
