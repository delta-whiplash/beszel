import { useLingui } from "@lingui/react/macro"
import { memo, useEffect, useState } from "react"
import { FooterRepoLink } from "@/components/footer-repo-link"
import { MonitorActionsButton, MonitorAlertButton } from "@/components/monitor-alert-button"
import { ActiveMonitorAlerts } from "@/components/active-monitor-alerts"
import { UptimeMonitorDialog } from "@/components/uptime-monitor-dialog"
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
import { MONITOR_STATUS_STYLES, UPTIME_DAY_STYLES } from "@/lib/monitor-status"
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

function StatusLabel({ status }: { status: MonitorStatus }) {
	const { t } = useLingui()
	const label =
		status === "down"
			? t`Down`
			: status === "warn"
				? t`Degraded`
				: status === "paused"
					? t`Paused`
					: t`Operational`
	return (
		<span
			title={label}
			className={`shrink-0 size-2 rounded-full ${MONITOR_STATUS_STYLES[status] ?? MONITOR_STATUS_STYLES.pending}`}
		>
			<span className="sr-only">{label}</span>
		</span>
	)
}

export default memo(() => {
	const { t } = useLingui()
	const [data, setData] = useState<UptimeResponse | null>(null)
	const [records, setRecords] = useState<Record<string, MonitorRecord>>({})
	const [error, setError] = useState("")
	const [dialogOpen, setDialogOpen] = useState(false)
	const [editing, setEditing] = useState<MonitorRecord | null>(null)
	const [viewMode, setViewMode] = useBrowserStorage<UptimeViewMode>("viewMode-uptime", "list")

	const openEdit = async (id: string) => {
		const cached = records[id]
		if (cached) {
			setEditing(cached)
			setDialogOpen(true)
			return
		}
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
		pb.collection<MonitorRecord>("monitors")
			.getFullList()
			.then((rows) => {
				if (!cancelled) {
					setRecords(Object.fromEntries(rows.map((r) => [r.id, r])))
				}
			})
			.catch(() => {})
		const unsub = pb.collection("monitors").subscribe("*", (e) => {
			const record = e.record as unknown as MonitorRecord
			setRecords((prev) => {
				if (e.action === "delete") {
					const next = { ...prev }
					delete next[record.id]
					return next
				}
				return { ...prev, [record.id]: record }
			})
		})
		return () => {
			cancelled = true
			unsub.then((fn) => {
				if (typeof fn === "function") {
					fn()
				}
			})
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
				<ActiveMonitorAlerts onSelect={openEdit} />
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
								<div
									role={isReadOnlyUser() ? undefined : "button"}
									tabIndex={isReadOnlyUser() ? undefined : 0}
									className="block w-full px-4 py-3 text-left"
									onClick={() => {
										if (!isReadOnlyUser()) {
											openEdit(m.id)
										}
									}}
									onKeyDown={(e) => {
										if ((e.key === "Enter" || e.key === " ") && !isReadOnlyUser()) {
											openEdit(m.id)
										}
									}}
									title={isReadOnlyUser() ? undefined : t`Edit monitor`}
								>
									<div className="mb-2 flex items-center justify-between gap-2">
										<span className="flex min-w-0 items-center gap-2">
											<StatusLabel status={m.status} />
											<span className="truncate text-sm font-medium">{m.name}</span>
											{m.maintenance && (
												<Badge variant="outline" title={m.maintenance}>
													{t`Maintenance`}
												</Badge>
											)}
										</span>
										<span className="flex shrink-0 items-center gap-1">
											{records[m.id] && (
												<>
													<span data-nolink onClick={(e) => e.stopPropagation()}>
														<MonitorAlertButton monitor={records[m.id]} />
													</span>
													<MonitorActionsButton monitor={records[m.id]} onEdit={openEdit} />
												</>
											)}
										</span>
									</div>
									<DayBars days={m.days} />
									<div className="mt-1 text-xs text-muted-foreground">
										{m.uptime > 0 ? t`${m.uptime.toFixed(2)} % uptime` : t`No data yet`}
									</div>
								</div>
							</Card>
						))}
					</div>
				) : (
					<Card>
						<CardContent className="divide-y p-0">
							{data.monitors.map((m) => (
								<div
									key={m.id}
									role={isReadOnlyUser() ? undefined : "button"}
									tabIndex={isReadOnlyUser() ? undefined : 0}
									className="block w-full px-4 py-3 text-left hover:bg-muted/40"
									onClick={() => {
										if (!isReadOnlyUser()) {
											openEdit(m.id)
										}
									}}
									onKeyDown={(e) => {
										if ((e.key === "Enter" || e.key === " ") && !isReadOnlyUser()) {
											openEdit(m.id)
										}
									}}
									title={isReadOnlyUser() ? undefined : t`Edit monitor`}
								>
									<div className="mb-2 flex items-center justify-between gap-2">
										<span className="flex min-w-0 items-center gap-2">
											<StatusLabel status={m.status} />
											<span className="truncate text-sm font-medium">{m.name}</span>
											{m.maintenance && (
												<Badge variant="outline" title={m.maintenance}>
													{t`Maintenance`}
												</Badge>
											)}
										</span>
										<span className="flex shrink-0 items-center gap-1">
											{records[m.id] && (
												<>
													<span data-nolink onClick={(e) => e.stopPropagation()}>
														<MonitorAlertButton monitor={records[m.id]} />
													</span>
													<MonitorActionsButton monitor={records[m.id]} onEdit={openEdit} />
												</>
											)}
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
