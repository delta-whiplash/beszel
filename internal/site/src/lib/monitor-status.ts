import type { MonitorStatus } from "@/types"

/** Badge background per monitor status (same palette as systems table). */
export const MONITOR_STATUS_STYLES: Record<MonitorStatus, string> = {
	up: "bg-green-500",
	down: "bg-red-500",
	warn: "bg-yellow-500",
	paused: "bg-primary/40",
	pending: "bg-yellow-500",
}

/** Text color per monitor status. */
export const MONITOR_STATUS_TEXT: Record<MonitorStatus, string> = {
	up: "text-green-600",
	down: "text-red-600",
	warn: "text-yellow-600",
	paused: "text-muted-foreground",
	pending: "text-yellow-600",
}
