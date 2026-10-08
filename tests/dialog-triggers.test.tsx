// @vitest-environment happy-dom
import { NextIntlClientProvider } from "next-intl";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import {
	EditTrigger,
	NewTrigger,
} from "@/components/organisation/governance-forms";
import {
	Dialog,
	DialogContent,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";

// Regression: NewTrigger/EditTrigger verwarfen die Props von
// `DialogTrigger asChild` — rund 50 Dialoge ließen sich nicht öffnen.
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
	document.body.innerHTML = "";
});

async function renderDialog(trigger: React.ReactNode) {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	await act(async () => {
		root.render(
			<NextIntlClientProvider
				locale="de"
				messages={{ Common: { edit: "Bearbeiten" } }}
			>
				<Dialog>
					<DialogTrigger asChild>{trigger}</DialogTrigger>
					<DialogContent>
						<DialogTitle>Dialog offen</DialogTitle>
					</DialogContent>
				</Dialog>
			</NextIntlClientProvider>,
		);
	});
	return host;
}

describe("Dialog-Trigger", () => {
	it.each([
		["NewTrigger", <NewTrigger key="n" label="Test planen" />],
		["EditTrigger", <EditTrigger key="e" />],
	])("%s öffnet den Dialog per Klick", async (_name, trigger) => {
		const host = await renderDialog(trigger);
		const button = host.querySelector("button");
		expect(button?.getAttribute("aria-haspopup")).toBe("dialog");
		await act(async () => {
			button?.click();
		});
		expect(document.body.textContent).toContain("Dialog offen");
	});
});
