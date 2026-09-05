import { useLingui } from "@lingui/react/macro"
import { memo, useEffect, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { Trans } from "@lingui/react/macro"
import { TriangleAlertIcon } from "lucide-react"
import { pb } from "@/lib/api"
import type { AlertRecord } from "@/types"

interface ActiveMonitor {
	id: string
	monitorId: string
	name: string
	message: string
}

/** Active monitor alerts, mirroring ActiveAlerts but sourced from the native
 * alerts table (triggered rows with a monitor). Realtime via subscription.
 * Clicking a card opens the monitor via onSelect, like systems link to detail. */
export const ActiveMonitorAlerts = memo(({ onSelect }: { onSelect?: (monitorId: string) => void }) => {
	const { t } = useLingui()
	const [actives, setActives] = useState<ActiveMonitor[]>([])

	useEffect(() => {
		let cancelled = false
		const load = () => {
			Promise.all([
				pb.collection("alerts").getFullList<AlertRecord>(200, { filter: "triggered = true" }),
				pb.collection("monitors").getFullList<{ id: string; name: string }>(),
			])
				.then(([rows, mons]) => {
					if (cancelled) {
						return
					}
					const names = Object.fromEntries(mons.map((m) => [m.id, m.name]))
					setActives(
						rows
							.filter((r) => r.monitor)
							.map((r) => ({
								id: r.id,
								monitorId: r.monitor,
								name: names[r.monitor] ?? r.monitor,
								message: t`Monitor is down`,
							}))
					)
				})
				.catch(() => {})
		}
		load()
		const unsub = pb.collection("alerts").subscribe("*", () => load())
		return () => {
			cancelled = true
			unsub.then((fn) => {
				if (typeof fn === "function") {
					fn()
				}
			})
		}
	}, [t])

	if (actives.length === 0) {
		return null
	}
	return (
		<Card>
			<CardHeader className="pb-4 px-2 sm:px-6 max-sm:pt-5 max-sm:pb-1">
				<div className="px-2 sm:px-1">
					<CardTitle>
						<Trans>Active Alerts</Trans>
					</CardTitle>
				</div>
			</CardHeader>
			<CardContent className="max-sm:p-2">
				<div className="grid sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
					{actives.map((alert) => (
						<Alert
							key={alert.id}
							className="relative hover:-translate-y-px duration-200 bg-transparent border-foreground/10 hover:shadow-md shadow-black/5"
						>
							<TriangleAlertIcon className="h-4 w-4" />
							<AlertTitle>{alert.name}</AlertTitle>
							<AlertDescription>{alert.message}</AlertDescription>
							{onSelect && (
								<button
									type="button"
									className="absolute inset-0 w-full h-full cursor-pointer"
									aria-label={`View ${alert.name}`}
									onClick={() => onSelect(alert.monitorId)}
								/>
							)}
						</Alert>
					))}
				</div>
			</CardContent>
		</Card>
	)
})
