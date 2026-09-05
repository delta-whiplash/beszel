import { useLingui } from "@lingui/react/macro"
import { memo, useEffect, useState } from "react"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { ActiveAlerts } from "@/components/active-alerts"
import { FooterRepoLink } from "@/components/footer-repo-link"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import Spinner from "@/components/spinner"
import { MONITOR_STATUS_STYLES } from "@/lib/monitor-status"
import { pb } from "@/lib/api"
import { formatShortDate } from "@/lib/utils"
import type { MonitorCheckRecord, MonitorRecord } from "@/types"

type MonitorRange = "1h" | "12h" | "24h" | "1w" | "30d"

const RANGES: { value: MonitorRange; label: string }[] = [
	{ value: "1h", label: "1 hour" },
	{ value: "12h", label: "12 hours" },
	{ value: "24h", label: "24 hours" },
	{ value: "1w", label: "1 week" },
	{ value: "30d", label: "30 days" },
]

function formatTime(iso: string): string {
	const d = new Date(iso)
	return Number.isNaN(d.getTime()) ? iso : formatShortDate(iso)
}

export default memo(({ id }: { id: string }) => {
	const { t } = useLingui()
	const [monitor, setMonitor] = useState<MonitorRecord | null>(null)
	const [checks, setChecks] = useState<MonitorCheckRecord[] | null>(null)
	const [range, setRange] = useState<MonitorRange>("24h")
	const [error, setError] = useState("")

	useEffect(() => {
		let cancelled = false
		pb.collection<MonitorRecord>("monitors")
			.getOne(id)
			.then((m) => {
				if (!cancelled) {
					setMonitor(m)
					document.title = `${m.name} / Beszel`
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
	}, [id])

	useEffect(() => {
		let cancelled = false
		setChecks(null)
		pb.send<MonitorCheckRecord[]>(`/api/beszel/monitors/${id}/checks?limit=1000&range=${range}`, {})
			.then((rows) => {
				if (!cancelled) {
					setChecks(rows)
				}
			})
			.catch(() => {
				if (!cancelled) {
					setChecks([])
				}
			})
		return () => {
			cancelled = true
		}
	}, [id, range])

	if (error) {
		return (
			<Card>
				<CardContent className="py-10 text-center text-destructive">{error}</CardContent>
			</Card>
		)
	}
	if (!monitor) {
		return (
			<div className="relative h-40">
				<Spinner />
			</div>
		)
	}

	const latencies = (checks ?? [])
		.filter((c) => c.latency_ms > 0)
		.slice(0, 500)
		.reverse()
		.map((c) => ({ time: formatTime(c.created), ms: c.latency_ms }))
	const ups = (checks ?? []).filter((c) => c.status === "up" || c.status === "warn").length
	const ratio = checks?.length ? (ups / checks.length) * 100 : 0

	return (
		<>
			<div className="flex flex-col gap-4">
				<ActiveAlerts />
				<div className="flex items-center justify-between gap-2">
					<div className="flex min-w-0 items-center gap-2">
						<h1 className="truncate text-xl font-semibold">{monitor.name}</h1>
						<Badge className={MONITOR_STATUS_STYLES[monitor.status] ?? MONITOR_STATUS_STYLES.pending}>
							{monitor.status}
						</Badge>
					</div>
					<Select value={range} onValueChange={(v) => setRange(v as MonitorRange)}>
						<SelectTrigger className="w-36">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{RANGES.map((r) => (
								<SelectItem key={r.value} value={r.value}>
									{r.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="grid gap-4 md:grid-cols-3">
					<Card>
						<CardHeader className="pb-2">
							<CardTitle className="text-sm font-medium">{t`Target`}</CardTitle>
						</CardHeader>
						<CardContent className="font-mono text-xs break-all">{monitor.target}</CardContent>
					</Card>
					<Card>
						<CardHeader className="pb-2">
							<CardTitle className="text-sm font-medium">{t`Uptime in range`}</CardTitle>
						</CardHeader>
						<CardContent className="text-2xl font-semibold">
							{checks?.length ? `${ratio.toFixed(2)}%` : "—"}
						</CardContent>
					</Card>
					<Card>
						<CardHeader className="pb-2">
							<CardTitle className="text-sm font-medium">{t`Last latency`}</CardTitle>
						</CardHeader>
						<CardContent className="text-2xl font-semibold">
							{monitor.last_latency_ms > 0 ? `${monitor.last_latency_ms.toFixed(0)} ms` : "—"}
						</CardContent>
					</Card>
				</div>
				{(monitor.type === "tls" || monitor.target.startsWith("https")) && monitor.cert_days > 0 && (
					<Card>
						<CardHeader className="pb-2">
							<CardTitle className="text-sm font-medium">{t`Certificate`}</CardTitle>
						</CardHeader>
						<CardContent className="text-sm text-muted-foreground">
							{t`Expires in ${monitor.cert_days.toFixed(0)} days`}
						</CardContent>
					</Card>
				)}
				{latencies.length > 1 && (
					<Card>
						<CardHeader className="pb-2">
							<CardTitle className="text-sm font-medium">{t`Latency (ms)`}</CardTitle>
						</CardHeader>
						<CardContent className="h-48">
							<ResponsiveContainer width="100%" height="100%">
								<AreaChart data={latencies}>
									<CartesianGrid strokeDasharray="3 3" />
									<XAxis dataKey="time" tick={false} />
									<YAxis width={40} />
									<Tooltip
										contentStyle={{
											backgroundColor: "var(--background)",
											borderColor: "var(--border)",
											borderRadius: "var(--radius)",
										}}
									/>
									<Area type="monotone" dataKey="ms" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.2} />
								</AreaChart>
							</ResponsiveContainer>
						</CardContent>
					</Card>
				)}
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium">{t`Recent checks`}</CardTitle>
					</CardHeader>
					<CardContent>
						{!checks ? (
							<div className="relative h-24">
								<Spinner />
							</div>
						) : checks.length === 0 ? (
							<p className="py-4 text-center text-sm text-muted-foreground">{t`No checks recorded yet.`}</p>
						) : (
							<div className="max-h-96 overflow-auto">
								<Table>
									<TableHeader className="sticky top-0 bg-background">
										<TableRow>
											<TableHead>{t`Time`}</TableHead>
											<TableHead>{t`Status`}</TableHead>
											<TableHead>{t`Latency`}</TableHead>
											<TableHead>{t`Message`}</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{checks.map((c) => (
											<TableRow key={c.id}>
												<TableCell className="whitespace-nowrap text-xs">{formatTime(c.created)}</TableCell>
												<TableCell>
													<Badge className={MONITOR_STATUS_STYLES[c.status]}>{c.status}</Badge>
												</TableCell>
												<TableCell>{c.latency_ms > 0 ? `${c.latency_ms.toFixed(0)} ms` : "—"}</TableCell>
												<TableCell className="text-xs text-muted-foreground">{c.message}</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</div>
						)}
					</CardContent>
				</Card>
			</div>
			<FooterRepoLink />
		</>
	)
})
