"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

function Toaster(props: ToasterProps) {
	// Darstellung folgt dem System (HIG: keine eigene Umschaltung)
	return (
		<Sonner
			theme="system"
			className="toaster group"
			position="bottom-right"
			// über der Tab-Leiste am Handy (styles/base.css, --bar-offset)
			mobileOffset={{ bottom: "calc(var(--bar-offset, 0px) + 16px)" }}
			containerAriaLabel="Meldungen"
			toastOptions={{
				closeButtonAriaLabel: "Meldung schließen",
				classNames: {
					toast: "group toast group-[.toaster]:bg-popover group-[.toaster]:text-popover-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:rounded-md",
					description: "group-[.toast]:text-muted-foreground",
					actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
					cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
				},
			}}
			{...props}
		/>
	);
}

export { Toaster };
