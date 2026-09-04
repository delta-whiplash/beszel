import { useLingui } from "@lingui/react/macro"
import { memo, useEffect, useState } from "react"
import { FooterRepoLink } from "@/components/footer-repo-link"
import { UptimeMonitorDialog } from "@/components/uptime-monitor-dialog"
import { Badge } from "@/components/ui/badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import Spinner from "@/components/spinner"
import { MONITOR_STATUS_STYLES, MONITOR_STATUS_TEXT, UPTIME_DAY_STYLES } from "@/lib/monitor-status"
import { isReadOnlyUser, pb } from "@/lib/api"
import { useBrowserStorage } from "@/lib/utils"
import { LayoutGridIcon, LayoutListIcon, PlusIcon, Settings2Icon } from "lucide-react"
import type { MonitorRecord, MonitorStatus } from "@/types"

type UptimeViewMode = "list" | "grid"

interface UptimeMonitor {
	id: string
	name: string
	status: MonitorStatus
	uptime: number
	days: string[]
	maintenance?: string
}

interface UptimeResponse {
	status: "operational" | "outage"
	monitors: UptimeMonitor[]
}

function DayBars({ days }: { days: string[] }) {
	return (
		<div className="flex items-end gap-[3px]" aria-hidden>
			{days.map((d, i) => (
				<div
					key={i}
					title={d || "no data"}
					className={`w-[4px] rounded-[2px] ${UPTIME_DAY_STYLES[d] ?? UPTIME_DAY_STYLES[""]} ${d === "down" ? "h-7" : d === "warn" ? "h-6" : d === "up" ? "h-5" : "h-4 opacity-40"}`}
				/>
			))}
		</div>
	)
}

export default memo(() => {
	const { t } = useLingui()
	const [data, setData] = useState<UptimeResponse | null>(null)
	const [error, setError] = useState("")
	const [dialogOpen, setDialogOpen] = useState(false)
	const [editing, setEditing] = useState<MonitorRecord | null>(null)
	const [viewMode, setViewMode] = useBrowserStorage<UptimeViewMode>("viewMode-uptime", "list")

	const openEdit = async (id: string) => {
		try {
			const record = await pb.collection<MonitorRecord>("monitors").getOne(id)
			setEditing(record)
			setDialogOpen(true)
		} catch {
			// record may be unreadable; fall back to create dialog
			setEditing(null)
			setDialogOpen(true)
		}
	}

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
				<div className="flex items-center justify-between gap-2">
					<h1 className="text-xl font-semibold">{t`Uptime`}</h1>
					<div className="flex items-center gap-2">
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="outline" size="sm">
									<Settings2Icon className="me-1.5 size-4 opacity-80" />
									{t`View`}
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuRadioGroup
									value={viewMode}
									onValueChange={(view) => setViewMode(view as UptimeViewMode)}
								>
									<DropdownMenuRadioItem value="list" onSelect={(e) => e.preventDefault()} className="gap-2">
										<LayoutListIcon className="size-4" />
										{t`List`}
									</DropdownMenuRadioItem>
									<DropdownMenuRadioItem value="grid" onSelect={(e) => e.preventDefault()} className="gap-2">
										<LayoutGridIcon className="size-4" />
										{t`Grid`}
									</DropdownMenuRadioItem>
								</DropdownMenuRadioGroup>
							</DropdownMenuContent>
						</DropdownMenu>
						{!isReadOnlyUser() && (
							<Button
								size="sm"
								onClick={() => {
									setEditing(null)
									setDialogOpen(true)
								}}
							>
								<PlusIcon /> {t`Add monitor`}
							</Button>
						)}
					</div>
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
				) : viewMode === "grid" ? (
					<div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
						{data.monitors.map((m) => (
							<Card key={m.id}>
								<button
									type="button"
									className="block w-full px-4 py-3 text-left"
									onClick={() => {
										if (!isReadOnlyUser()) {
											openEdit(m.id)
										}
									}}
									title={isReadOnlyUser() ? undefined : t`Edit monitor`}
								>
									<div className="mb-2 flex items-center justify-between gap-2">
										<span className="flex min-w-0 items-center gap-2">
											<span className="truncate text-sm font-medium">{m.name}</span>
											{m.maintenance && (
												<Badge variant="outline" title={m.maintenance}>
													{t`Maintenance`}
												</Badge>
											)}
										</span>
										<Badge className={MONITOR_STATUS_STYLES[m.status] ?? MONITOR_STATUS_STYLES.pending}>
											{m.status}
										</Badge>
									</div>
									<DayBars days={m.days} />
									<div className="mt-1 text-xs text-muted-foreground">
										{m.uptime > 0 ? t`${m.uptime.toFixed(2)} % uptime` : t`No data yet`}
									</div>
								</button>
							</Card>
						))}
					</div>
				) : (
					<Card>
						<CardContent className="divide-y p-0">
							{data.monitors.map((m) => (
								<button
									key={m.id}
									type="button"
									className="block w-full px-4 py-3 text-left hover:bg-muted/40 disabled:cursor-default disabled:hover:bg-transparent"
									disabled={isReadOnlyUser()}
									onClick={() => openEdit(m.id)}
									title={isReadOnlyUser() ? undefined : t`Edit monitor`}
								>
									<div className="mb-2 flex items-center justify-between gap-2">
										<span className="flex min-w-0 items-center gap-2">
											<span className="truncate text-sm font-medium">{m.name}</span>
											{m.maintenance && (
												<Badge variant="outline" title={m.maintenance}>
													{t`Maintenance`}
												</Badge>
											)}
										</span>
										<span
											className={`shrink-0 text-xs font-medium ${MONITOR_STATUS_TEXT[m.status] ?? MONITOR_STATUS_TEXT.up}`}
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
									</button>
								))}
							</CardContent>
						</Card>
					)}
					<p className="text-center text-xs text-muted-foreground">
						{t`Uptime over the past 90 days, one bar per day.`}
					</p>
				</div>
			<FooterRepoLink />
			{!isReadOnlyUser() && (
				<UptimeMonitorDialog
					open={dialogOpen}
					setOpen={setDialogOpen}
					monitor={editing ?? undefined}
					onSaved={() => {
						setDialogOpen(false)
						setEditing(null)
					}}
				/>
			)}
		</>
	)
})
