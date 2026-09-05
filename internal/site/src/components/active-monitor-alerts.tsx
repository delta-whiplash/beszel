import { useLingui } from "@lingui/react/macro"
import { memo, useEffect, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { Trans } from "@lingui/react/macro"
import { TriangleAlertIcon } from "lucide-react"
import { pb } from "@/lib/api"

interface ActiveMonitor {
	id: string
	name: string
	status: string
	message: string
}

export const ActiveMonitorAlerts = memo(() => {
	const { t } = useLingui()
	const [actives, setActives] = useState<ActiveMonitor[]>([])

	useEffect(() => {
		let cancelled = false
		pb.send<{ down: { id: string; name: string }[] }>("/api/beszel/monitors/summary", {})
			.then((summary) => {
				if (!cancelled) {
					setActives(
						(summary.down ?? []).map((d) => ({
							id: d.id,
							name: d.name,
							status: "down",
							message: t`Monitor is down`,
						}))
					)
				}
			})
			.catch(() => {})
		return () => {
			cancelled = true
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
							className="hover:-translate-y-px duration-200 bg-transparent border-foreground/10 hover:shadow-md shadow-black/5"
						>
							<TriangleAlertIcon className="h-4 w-4" />
							<AlertTitle>{alert.name}</AlertTitle>
							<AlertDescription>{alert.message}</AlertDescription>
						</Alert>
					))}
				</div>
			</CardContent>
		</Card>
	)
})
