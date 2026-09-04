import { useLingui } from "@lingui/react/macro"
import { memo, useEffect, useState } from "react"
import { FooterRepoLink } from "@/components/footer-repo-link"
import { Card, CardContent } from "@/components/ui/card"
import Spinner from "@/components/spinner"
import { $router, Link } from "@/components/router"
import { getPagePath } from "@nanostores/router"
import { pb } from "@/lib/api"

interface UptimeMonitor {
	id: string
	name: string
	status: string
	uptime: number
	days: string[]
}

interface UptimeResponse {
	status: "operational" | "outage"
	monitors: UptimeMonitor[]
}

const BAR_COLORS: Record<string, string> = {
	up: "bg-green-500",
	down: "bg-red-500",
	warn: "bg-yellow-500",
	"": "bg-muted",
}

function DayBars({ days }: { days: string[] }) {
	return (
		<div className="flex items-end gap-[2px]" aria-hidden>
			{days.map((d, i) => (
				<div
					key={i}
					title={d || "no data"}
					className={`w-[3px] rounded-sm ${BAR_COLORS[d] ?? BAR_COLORS[""]} ${d === "down" ? "h-6" : d === "warn" ? "h-5" : d === "up" ? "h-4" : "h-3 opacity-50"}`}
				/>
			))}
		</div>
	)
}

export default memo(() => {
	const { t } = useLingui()
	const [data, setData] = useState<UptimeResponse | null>(null)
	const [error, setError] = useState("")

	useEffect(() => {
		document.title = `${t`Uptime`} / Beszel`
		let cancelled = false
		pb.send<UptimeResponse>("/api/beszel/monitors/uptime", {})
			.then((res) => {
				if (!cancelled) {
					setData(res)
				}
			})
			.catch((e: unknown) => {
				if (!cancelled) {
					setError(e instanceof Error ? e.message : String(e))
				}
			})
		return () => {
			cancelled = true
		}
	}, [t])

	if (error) {
		return (
			<Card>
				<CardContent className="py-10 text-center text-destructive">{error}</CardContent>
			</Card>
		)
	}
	if (!data) {
		return (
			<div className="relative h-40">
				<Spinner />
			</div>
		)
	}

	const operational = data.status === "operational"

	return (
		<>
			<div className="mx-auto flex max-w-4xl flex-col gap-6">
				<div className="flex items-center justify-between">
					<h1 className="text-xl font-semibold">{t`Uptime`}</h1>
					<Link
						href={getPagePath($router, "monitors")}
						className="text-sm text-muted-foreground hover:underline"
					>
						{t`Manage monitors`}
					</Link>
				</div>
				<div
					className={`rounded-md px-4 py-3 text-lg font-medium text-white ${operational ? "bg-green-600" : "bg-red-600"}`}
				>
					{operational ? t`All Systems Operational` : t`Service Disruption`}
				</div>
				{data.monitors.length === 0 ? (
					<Card>
						<CardContent className="py-10 text-center text-muted-foreground">
							{t`No monitors yet.`}
						</CardContent>
					</Card>
				) : (
					<Card>
						<CardContent className="divide-y p-0">
							{data.monitors.map((m) => (
								<div key={m.id} className="px-4 py-3">
									<div className="mb-2 flex items-center justify-between gap-2">
										<Link
											href={getPagePath($router, "monitor", { id: m.id })}
											className="truncate text-sm font-medium hover:underline"
										>
											{m.name}
										</Link>
										<span
											className={`shrink-0 text-xs font-medium ${m.status === "down" ? "text-red-600" : m.status === "warn" ? "text-yellow-600" : "text-green-600"}`}
										>
											{m.status === "down"
												? t`Down`
												: m.status === "warn"
													? t`Degraded`
													: m.status === "paused"
														? t`Paused`
														: t`Operational`}
										</span>
									</div>
									<DayBars days={m.days} />
									<div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
										<span>{t`90 days ago`}</span>
										<span>
											{m.uptime > 0 ? t`${m.uptime.toFixed(2)} % uptime` : t`No data yet`}
										</span>
										<span>{t`Today`}</span>
									</div>
								</div>
							))}
						</CardContent>
					</Card>
				)}
				<p className="text-center text-xs text-muted-foreground">
					{t`Uptime over the past 90 days, one bar per day.`}
				</p>
			</div>
			<FooterRepoLink />
		</>
	)
})
