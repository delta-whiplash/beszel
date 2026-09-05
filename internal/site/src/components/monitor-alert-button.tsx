import { Trans, useLingui } from "@lingui/react/macro"
import { memo, useEffect, useState } from "react"
import {
	BellIcon,
	CopyIcon,
	MoreHorizontalIcon,
	PauseCircleIcon,
	PenBoxIcon,
	PlayCircleIcon,
	Trash2Icon,
} from "lucide-react"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button, buttonVariants } from "@/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/use-toast"
import { cn } from "@/lib/utils"
import { isReadOnlyUser, pb } from "@/lib/api"
import type { MonitorRecord } from "@/types"

interface MaintenanceWindow {
	id: string
	reason: string
	start: string
	end: string
}

/** Bell button opening the monitor alert settings, mirroring AlertButton. */
export const MonitorAlertButton = memo(function MonitorAlertButton({ monitor }: { monitor: MonitorRecord }) {
	const { t } = useLingui()
	const [opened, setOpened] = useState(false)
	const active = monitor.notify && !monitor.paused
	return (
		<Sheet>
			<SheetTrigger asChild>
				<Button variant="ghost" size="icon" aria-label={t`Alerts`} data-nolink onClick={() => setOpened(true)}>
					<BellIcon className={cn("size-[1.2em] pointer-events-none", { "fill-primary": active })} />
				</Button>
			</SheetTrigger>
			<SheetContent className="max-h-full overflow-auto w-160 !max-w-full p-4 sm:p-6">
				{opened && <MonitorAlertSheetContent monitor={monitor} />}
			</SheetContent>
		</Sheet>
	)
})

function splitLines(v: string): string[] {
	return v
		.split("\n")
		.map((s) => s.trim())
		.filter((s) => s.length > 0)
}

export const MonitorAlertSheetContent = memo(function MonitorAlertSheetContent({ monitor }: { monitor: MonitorRecord }) {
	const { t } = useLingui()
	const [notify, setNotify] = useState(monitor.notify)
	const [resendAfter, setResendAfter] = useState(String(monitor.resend_after ?? 0))
	const [emails, setEmails] = useState((monitor.notify_emails ?? []).join("\n"))
	const [webhooks, setWebhooks] = useState((monitor.notify_webhooks ?? []).join("\n"))
	const [windows, setWindows] = useState<MaintenanceWindow[]>([])
	const [reason, setReason] = useState("")
	const [start, setStart] = useState("")
	const [end, setEnd] = useState("")
	const [saving, setSaving] = useState(false)

	const load = () => {
		pb.send<MaintenanceWindow[]>(`/api/beszel/monitors/${monitor.id}/maintenance`, {}).then(setWindows).catch(() => {})
	}
	useEffect(load, [monitor.id])

	const saveAlerts = async () => {
		const resend = Number.parseInt(resendAfter, 10)
		if (!(resend >= 0 && resend <= 1440)) {
			toast({ title: t`Resend delay must be between 0 and 1440 minutes.`, variant: "destructive" })
			return
		}
		setSaving(true)
		try {
			await pb.collection("monitors").update(monitor.id, {
				notify,
				resend_after: resend,
				notify_emails: splitLines(emails),
				notify_webhooks: splitLines(webhooks),
			})
			toast({ title: t`Alert settings saved` })
		} catch (e) {
			toast({ title: t`Save failed`, description: e instanceof Error ? e.message : String(e), variant: "destructive" })
		} finally {
			setSaving(false)
		}
	}

	const addWindow = async () => {
		const fmt = (v: string) => (v.length === 16 ? `${v.replace("T", " ")}:00.000Z` : v)
		try {
			await pb.send(`/api/beszel/monitors/${monitor.id}/maintenance`, {
				method: "POST",
				body: { reason, start: fmt(start), end: fmt(end) },
			})
			setReason("")
			setStart("")
			setEnd("")
			load()
		} catch (e) {
			toast({ title: t`Add failed`, description: e instanceof Error ? e.message : String(e), variant: "destructive" })
		}
	}

	const removeWindow = async (id: string) => {
		await pb.send(`/api/beszel/monitors/${monitor.id}/maintenance/${id}`, { method: "DELETE" })
		load()
	}

	return (
		<>
			<SheetHeader>
				<SheetTitle className="text-xl">
					<Trans>Alerts</Trans> — {monitor.name}
				</SheetTitle>
				<SheetDescription>
					<Trans>Notifications are sent on status changes using your global channels, optionally restricted below.</Trans>
				</SheetDescription>
			</SheetHeader>
			<div className="mt-4 grid gap-4">
				<div className="flex items-center justify-between">
					<Label htmlFor="malert-notify">{t`Send notifications`}</Label>
					<Switch id="malert-notify" checked={notify} onCheckedChange={setNotify} />
				</div>
				<div className="grid gap-2">
					<Label htmlFor="malert-resend">{t`Resend every (minutes, 0 = never)`}</Label>
					<Input id="malert-resend" value={resendAfter} onChange={(e) => setResendAfter(e.target.value)} inputMode="numeric" />
				</div>
				<div className="grid gap-2">
					<Label htmlFor="malert-emails">{t`Emails (one per line, empty = all)`}</Label>
					<Textarea id="malert-emails" value={emails} onChange={(e) => setEmails(e.target.value)} rows={2} />
				</div>
				<div className="grid gap-2">
					<Label htmlFor="malert-webhooks">{t`Webhooks (one per line, empty = all)`}</Label>
					<Textarea id="malert-webhooks" value={webhooks} onChange={(e) => setWebhooks(e.target.value)} rows={2} />
				</div>
				<Button onClick={saveAlerts} disabled={saving || isReadOnlyUser()}>
					{t`Save alert settings`}
				</Button>
				<div className="grid gap-2 border-t pt-4">
					<Label>{t`Maintenance windows (no notifications while active)`}</Label>
					{windows.map((w) => (
						<div key={w.id} className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
							<span className="truncate">
								{w.reason || t`Maintenance`} — {w.start} → {w.end}
							</span>
							<Button variant="ghost" size="sm" onClick={() => removeWindow(w.id)}>
								{t`Remove`}
							</Button>
						</div>
					))}
					<div className="grid grid-cols-2 gap-2">
						<Input value={start} onChange={(e) => setStart(e.target.value)} type="datetime-local" aria-label={t`Start`} />
						<Input value={end} onChange={(e) => setEnd(e.target.value)} type="datetime-local" aria-label={t`End`} />
					</div>
					<Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t`Reason (optional)` as string} />
					<Button variant="outline" size="sm" onClick={addWindow} disabled={!start || !end || isReadOnlyUser()}>
						{t`Add maintenance window`}
					</Button>
				</div>
			</div>
		</>
	)
})

export const MonitorActionsButton = memo(function MonitorActionsButton({
	monitor,
	onEdit,
}: {
	monitor: MonitorRecord
	onEdit: (id: string) => void
}) {
	const { t } = useLingui()
	const [deleteOpen, setDeleteOpen] = useState(false)
	const copyToClipboard = (text: string) => {
		navigator.clipboard?.writeText(text).catch(() => {})
	}
	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" size="icon" data-nolink>
						<span className="sr-only">
							<Trans>Open menu</Trans>
						</span>
						<MoreHorizontalIcon className="w-5" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					{!isReadOnlyUser() && (
						<DropdownMenuItem onSelect={() => onEdit(monitor.id)}>
							<PenBoxIcon className="me-2.5 size-4" />
							<Trans>Edit</Trans>
						</DropdownMenuItem>
					)}
					<DropdownMenuItem
						className={cn(isReadOnlyUser() && "hidden")}
						onClick={() => {
							pb.collection("monitors").update(monitor.id, { paused: !monitor.paused })
						}}
					>
						{monitor.paused ? (
							<>
								<PlayCircleIcon className="me-2.5 size-4" />
								<Trans>Resume</Trans>
							</>
						) : (
							<>
								<PauseCircleIcon className="me-2.5 size-4" />
								<Trans>Pause</Trans>
							</>
						)}
					</DropdownMenuItem>
					<DropdownMenuItem onClick={() => copyToClipboard(monitor.name)}>
						<CopyIcon className="me-2.5 size-4" />
						<Trans>Copy name</Trans>
					</DropdownMenuItem>
					<DropdownMenuItem onClick={() => copyToClipboard(monitor.target)}>
						<CopyIcon className="me-2.5 size-4" />
						<Trans>Copy target</Trans>
					</DropdownMenuItem>
					<DropdownMenuSeparator className={cn(isReadOnlyUser() && "hidden")} />
					<DropdownMenuItem className={cn(isReadOnlyUser() && "hidden")} onSelect={() => setDeleteOpen(true)}>
						<Trash2Icon className="me-2.5 size-4" />
						<Trans>Delete</Trans>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							<Trans>Are you sure you want to delete {monitor.name}?</Trans>
						</AlertDialogTitle>
						<AlertDialogDescription>
							<Trans>This action cannot be undone. This will permanently delete the monitor and its check history.</Trans>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>
							<Trans>Cancel</Trans>
						</AlertDialogCancel>
						<AlertDialogAction
							className={cn(buttonVariants({ variant: "destructive" }))}
							onClick={() => pb.collection("monitors").delete(monitor.id)}
						>
							<Trans>Continue</Trans>
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	)
})
