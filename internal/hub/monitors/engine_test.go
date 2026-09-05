//go:build testing

package monitors_test

import (
	"context"
	"sync"
	"testing"
	"time"

	beszelTests "github.com/henrygd/beszel/internal/tests"

	"github.com/henrygd/beszel/internal/hub/monitors"
	_ "github.com/henrygd/beszel/internal/migrations"

	"github.com/pocketbase/pocketbase/core"
	pbtests "github.com/pocketbase/pocketbase/tests"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type sentAlert struct {
	userID string
	title  string
}

type fakeSender struct {
	mu   sync.Mutex
	sent []sentAlert
}

func (f *fakeSender) Send(userID, title, message, link string, emails, webhooks []string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.sent = append(f.sent, sentAlert{userID: userID, title: title})
}

func (f *fakeSender) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.sent)
}

func seedEngineMonitor(t *testing.T, app *pbtests.TestApp, name string, notify bool, maxRetries int) (*core.Record, *core.Record) {
	t.Helper()
	users, err := app.FindCachedCollectionByNameOrId("users")
	require.NoError(t, err)
	user := core.NewRecord(users)
	user.Set("email", name+"@example.com")
	user.Set("password", "password12345")
	require.NoError(t, app.Save(user))

	col, err := app.FindCachedCollectionByNameOrId("monitors")
	require.NoError(t, err)
	mon := core.NewRecord(col)
	mon.Set("name", name)
	mon.Set("type", "ping")
	mon.Set("target", "example.com")
	mon.Set("interval", 60)
	mon.Set("timeout", 10)
	mon.Set("max_retries", maxRetries)
	mon.Set("notify", notify)
	mon.Set("status", "pending")
	mon.Set("users", []string{user.Id})
	require.NoError(t, app.Save(mon))
	return mon, user
}

func newEngineTestApp(t *testing.T) *pbtests.TestApp {
	t.Helper()
	app, err := pbtests.NewTestApp(t.TempDir())
	require.NoError(t, err)
	t.Cleanup(func() { app.Cleanup() })
	return app
}

func TestEngine_DownTransitionPersistsAndNotifies(t *testing.T) {
	app := newEngineTestApp(t)
	mon, user := seedEngineMonitor(t, app, "eng", true, 0)
	sender := &fakeSender{}

	eng := monitors.NewEngine(app, sender.Send)
	eng.SetCheck(func(ctx context.Context, m monitors.Monitor) monitors.CheckResult {
		return monitors.CheckResult{Status: monitors.StatusDown, Message: "boom"}
	})
	require.NoError(t, eng.SyncOne(mon.Id))
	eng.Stop()

	stored, err := app.FindRecordById("monitors", mon.Id)
	require.NoError(t, err)
	assert.Equal(t, "down", stored.GetString("status"))

	total, err := app.CountRecords("monitor_checks")
	require.NoError(t, err)
	assert.EqualValues(t, 1, total)

	assert.Equal(t, 1, sender.count(), "one DOWN transition must notify once")
	sender.mu.Lock()
	title := sender.sent[0].title
	uid := sender.sent[0].userID
	sender.mu.Unlock()
	assert.Contains(t, title, "eng")
	assert.Equal(t, user.Id, uid)
}

func TestEngine_SilentWhenNotifyFalse(t *testing.T) {
	app := newEngineTestApp(t)
	mon, _ := seedEngineMonitor(t, app, "quiet", false, 0)
	sender := &fakeSender{}

	eng := monitors.NewEngine(app, sender.Send)
	eng.SetCheck(func(ctx context.Context, m monitors.Monitor) monitors.CheckResult {
		return monitors.CheckResult{Status: monitors.StatusDown, Message: "boom"}
	})
	require.NoError(t, eng.SyncOne(mon.Id))
	eng.Stop()

	assert.Equal(t, 0, sender.count(), "notify=false must stay silent")
	total, err := app.CountRecords("monitor_checks")
	require.NoError(t, err)
	assert.EqualValues(t, 1, total, "silent monitors are still recorded")
}

func TestEngine_RecoveryNotifies(t *testing.T) {
	app := newEngineTestApp(t)
	mon, _ := seedEngineMonitor(t, app, "flap", true, 0)
	sender := &fakeSender{}

	eng := monitors.NewEngine(app, sender.Send)
	down := true
	eng.SetCheck(func(ctx context.Context, m monitors.Monitor) monitors.CheckResult {
		if down {
			return monitors.CheckResult{Status: monitors.StatusDown, Message: "boom"}
		}
		return monitors.CheckResult{Status: monitors.StatusUp, LatencyMs: 1}
	})
	require.NoError(t, eng.SyncOne(mon.Id))
	down = false
	// Reload failures like the scheduler loop would, then sync again.
	require.NoError(t, eng.SyncOne(mon.Id))
	eng.Stop()

	assert.Equal(t, 2, sender.count(), "down then recovery must notify twice")
}

func TestEngine_ResendAfterSuppressesImmediateRepeat(t *testing.T) {
	app := newEngineTestApp(t)
	mon, _ := seedEngineMonitor(t, app, "resend", true, 0)
	mon.Set("resend_after", 60)
	require.NoError(t, app.Save(mon))
	sender := &fakeSender{}

	eng := monitors.NewEngine(app, sender.Send)
	eng.SetCheck(func(ctx context.Context, m monitors.Monitor) monitors.CheckResult {
		return monitors.CheckResult{Status: monitors.StatusDown, Message: "boom"}
	})
	require.NoError(t, eng.SyncOne(mon.Id))
	require.NoError(t, eng.SyncOne(mon.Id))
	eng.Stop()

	assert.Equal(t, 1, sender.count(), "second DOWN inside resend window must not renotify")
}

func TestEngine_WarnTransitionNotifies(t *testing.T) {
	app := newEngineTestApp(t)
	mon, _ := seedEngineMonitor(t, app, "tlswarn", true, 0)
	sender := &fakeSender{}

	eng := monitors.NewEngine(app, sender.Send)
	eng.SetCheck(func(ctx context.Context, m monitors.Monitor) monitors.CheckResult {
		return monitors.CheckResult{Status: monitors.StatusWarn, Message: "expiring soon"}
	})
	require.NoError(t, eng.SyncOne(mon.Id))
	eng.Stop()

	assert.Equal(t, 1, sender.count(), "warn entry must notify once")
}

func TestEngine_WarnExitNotifiesRecovery(t *testing.T) {
	app := newEngineTestApp(t)
	mon, _ := seedEngineMonitor(t, app, "warnexit", true, 0)
	sender := &fakeSender{}

	eng := monitors.NewEngine(app, sender.Send)
	warn := true
	eng.SetCheck(func(ctx context.Context, m monitors.Monitor) monitors.CheckResult {
		if warn {
			return monitors.CheckResult{Status: monitors.StatusWarn, Message: "expiring soon"}
		}
		return monitors.CheckResult{Status: monitors.StatusUp, LatencyMs: 2}
	})
	require.NoError(t, eng.SyncOne(mon.Id))
	warn = false
	require.NoError(t, eng.SyncOne(mon.Id))
	eng.Stop()

	assert.Equal(t, 2, sender.count(), "warn entry then recovery must notify twice")
}

func TestEngine_RecoveryMessageHasDurationAndUptime(t *testing.T) {
	app := newEngineTestApp(t)
	mon, _ := seedEngineMonitor(t, app, "rich", true, 0)
	var messages []string
	var mu sync.Mutex
	eng := monitors.NewEngine(app, func(userID, title, message, link string, emails, webhooks []string) {
		mu.Lock()
		messages = append(messages, title+"|"+message+"|"+link)
		mu.Unlock()
	})
	down := true
	eng.SetCheck(func(ctx context.Context, m monitors.Monitor) monitors.CheckResult {
		if down {
			return monitors.CheckResult{Status: monitors.StatusDown, Message: "boom", LatencyMs: 42}
		}
		return monitors.CheckResult{Status: monitors.StatusUp, LatencyMs: 1}
	})
	require.NoError(t, eng.SyncOne(mon.Id))
	down = false
	require.NoError(t, eng.SyncOne(mon.Id))
	eng.Stop()

	mu.Lock()
	defer mu.Unlock()
	require.Len(t, messages, 2)
	assert.Contains(t, messages[0], "latency 42.0 ms", "down notice must carry latency")
	assert.Contains(t, messages[0], "/monitors/"+mon.Id, "link must carry monitor id")
	assert.Contains(t, messages[1], "after ", "recovery must carry down duration")
	assert.Contains(t, messages[1], "uptime", "recovery must carry 24h uptime")
}

func TestEngine_LiveLoopSurvivesOwnWrites(t *testing.T) {
	app := newEngineTestApp(t)
	mon, _ := seedEngineMonitor(t, app, "live", true, 0)
	sender := &fakeSender{}

	eng := monitors.NewEngine(app, sender.Send)
	require.NoError(t, eng.Start())
	t.Cleanup(eng.Stop)

	// Drive the scheduler loop directly with a 1s interval: each tick
	// persists via SaveCheckResult, which fires the monitors update hook.
	// Before the scheduleRelevantChange guard this deadlocked (Remove waits
	// for the loop running runOnce) and wedged the semaphore.
	m := monitors.Monitor{ID: mon.Id, Name: "live", Type: monitors.TypePing, Target: "example.com", IntervalSeconds: 1, TimeoutSeconds: 5}
	eng.TestAdd(m, func(ctx context.Context, mm monitors.Monitor) monitors.CheckResult {
		return monitors.CheckResult{Status: monitors.StatusUp, LatencyMs: 1}
	})

	deadline := time.Now().Add(12 * time.Second)
	for {
		total, err := app.CountRecords("monitor_checks")
		require.NoError(t, err)
		if total >= 3 {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("live loop stalled: only %d cycles in 12s (hook deadlock?)", total)
		}
		time.Sleep(200 * time.Millisecond)
	}
}

func TestEngine_MaintenanceSuppressesNotify(t *testing.T) {
	app := newEngineTestApp(t)
	mon, _ := seedEngineMonitor(t, app, "maint", true, 0)
	sender := &fakeSender{}

	mwc, err := app.FindCachedCollectionByNameOrId("maintenance_windows")
	require.NoError(t, err)
	w := core.NewRecord(mwc)
	w.Set("monitor", mon.Id)
	w.Set("start", "2000-01-01 00:00:00.000Z")
	w.Set("end", "2100-01-01 00:00:00.000Z")
	w.Set("reason", "upgrade")
	require.NoError(t, app.Save(w))

	eng := monitors.NewEngine(app, sender.Send)
	eng.SetCheck(func(ctx context.Context, m monitors.Monitor) monitors.CheckResult {
		return monitors.CheckResult{Status: monitors.StatusDown, Message: "boom"}
	})
	require.NoError(t, eng.SyncOne(mon.Id))
	eng.Stop()

	assert.Equal(t, 0, sender.count(), "maintenance must suppress notifications")
	total, err := app.CountRecords("monitor_checks")
	require.NoError(t, err)
	assert.EqualValues(t, 1, total, "checks still recorded during maintenance")

	active, reason, err := monitors.InMaintenance(app, mon.Id, time.Now().UTC())
	require.NoError(t, err)
	assert.True(t, active)
	assert.Equal(t, "upgrade", reason)
}

func TestEngine_NativeAlertRows(t *testing.T) {
	// Full hub (not bare TestApp) so AlertManager hooks write history.
	hub, err := beszelTests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	defer hub.Cleanup()
	app := hub.TestApp
	mon, user := seedEngineMonitor(t, app, "native", true, 0)
	sender := &fakeSender{}

	eng := monitors.NewEngine(app, sender.Send)
	down := true
	eng.SetCheck(func(ctx context.Context, m monitors.Monitor) monitors.CheckResult {
		if down {
			return monitors.CheckResult{Status: monitors.StatusDown, Message: "boom"}
		}
		return monitors.CheckResult{Status: monitors.StatusUp, LatencyMs: 1}
	})
	require.NoError(t, eng.SyncOne(mon.Id))

	rows, err := monitorAlertRows(t, app)
	require.NoError(t, err)
	require.Len(t, rows, 1, "down transition must open a native alert row")
	require.True(t, rows[0].GetBool("triggered"))
	require.Equal(t, user.Id, rows[0].GetString("user"))
	require.Equal(t, "MonitorStatus", rows[0].GetString("name"))

	history, err := app.FindRecordsByFilter("alerts_history", "alert_id != ''", "", -1, 0)
	require.NoError(t, err)
	require.Len(t, history, 1, "trigger must write alerts_history via existing hooks")

	down = false
	require.NoError(t, eng.SyncOne(mon.Id))
	eng.Stop()

	rows, err = monitorAlertRows(t, app)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.False(t, rows[0].GetBool("triggered"), "recovery must resolve the alert row")

	history, err = app.FindRecordsByFilter("alerts_history", "alert_id != ''", "", -1, 0)
	require.NoError(t, err)
	require.Len(t, history, 1)
	require.False(t, history[0].GetDateTime("resolved").IsZero(), "recovery must resolve history")
}

func monitorAlertRows(t *testing.T, app *pbtests.TestApp) ([]*core.Record, error) {
	t.Helper()
	all, err := app.FindAllRecords("alerts")
	if err != nil {
		return nil, err
	}
	out := make([]*core.Record, 0)
	for _, r := range all {
		if r.GetString("monitor") != "" {
			out = append(out, r)
		}
	}
	return out, nil
}
