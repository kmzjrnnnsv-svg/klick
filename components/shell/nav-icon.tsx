import {
	Activity,
	BookOpen,
	Building2,
	Calendar,
	ClipboardCheck,
	Coins,
	FileCheck2,
	FileText,
	FlaskConical,
	FolderOpen,
	Gauge,
	Gavel,
	GitMerge,
	GraduationCap,
	Landmark,
	Lock,
	Map as MapIcon,
	MessageSquare,
	Presentation,
	Server,
	Settings,
	ShieldCheck,
	Siren,
	Sun,
	TriangleAlert,
	Truck,
	Users,
	Workflow,
	Wrench,
} from "lucide-react";
import type { NavIcon as NavIconName } from "@/lib/nav";

const ICONS = {
	sun: Sun,
	gauge: Gauge,
	"shield-check": ShieldCheck,
	"git-merge": GitMerge,
	"file-check": FileCheck2,
	"triangle-alert": TriangleAlert,
	"file-text": FileText,
	workflow: Workflow,
	truck: Truck,
	server: Server,
	siren: Siren,
	"graduation-cap": GraduationCap,
	lock: Lock,
	building: Building2,
	gavel: Gavel,
	"clipboard-check": ClipboardCheck,
	presentation: Presentation,
	wrench: Wrench,
	flask: FlaskConical,
	calendar: Calendar,
	map: MapIcon,
	landmark: Landmark,
	coins: Coins,
	bitcoin: Coins,
	"message-square": MessageSquare,
	"folder-open": FolderOpen,
	"book-open": BookOpen,
	users: Users,
	settings: Settings,
	activity: Activity,
} as const;

export function NavIcon({
	name,
	className,
}: {
	name: NavIconName;
	className?: string;
}) {
	const Icon = ICONS[name] ?? ShieldCheck;
	return <Icon className={className} strokeWidth={1.5} aria-hidden="true" />;
}
