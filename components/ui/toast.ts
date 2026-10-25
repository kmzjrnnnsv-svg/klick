import { type ExternalToast, toast as sonner } from "sonner";

// Rückmeldungen beider Apps nur über dieses Modul (Test ui-feedback).
// Erfolg verschwindet von selbst; ein Fehler bleibt stehen, bis er
// geschlossen wird (Apple HIG: Wichtiges nicht in einer Meldung, die von
// allein verschwindet). Ereignisse mit Folgen gehören zusätzlich als
// Meldung in die Ansicht (components/ui/alert.tsx).
function error(message: Parameters<typeof sonner.error>[0], data?: ExternalToast) {
	return sonner.error(message, {
		duration: Number.POSITIVE_INFINITY,
		closeButton: true,
		...data,
	});
}

export const toast: typeof sonner = Object.assign(
	(...args: Parameters<typeof sonner>) => sonner(...args),
	sonner,
	{ error },
);
