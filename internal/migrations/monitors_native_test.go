//go:build testing

package migrations_test

import (
	"testing"

	_ "github.com/henrygd/beszel/internal/migrations"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMonitorAlertsNativeSchema(t *testing.T) {
	app, err := tests.NewTestApp(t.TempDir())
	require.NoError(t, err)
	defer app.Cleanup()

	alerts, err := app.FindCachedCollectionByNameOrId("alerts")
	require.NoError(t, err)
	monitorField := alerts.Fields.GetByName("monitor")
	require.NotNil(t, monitorField, "alerts.monitor must exist")
	systemField := alerts.Fields.GetByName("system")
	require.NotNil(t, systemField)

	history, err := app.FindCachedCollectionByNameOrId("alerts_history")
	require.NoError(t, err)
	require.NotNil(t, history.Fields.GetByName("monitor"), "alerts_history.monitor must exist")

	// A monitor alert row: user + monitor, no system.
	users, err := app.FindCachedCollectionByNameOrId("users")
	require.NoError(t, err)
	user := core.NewRecord(users)
	user.Set("email", "native@example.com")
	user.Set("password", "password12345")
	require.NoError(t, app.Save(user))

	monitors, err := app.FindCachedCollectionByNameOrId("monitors")
	require.NoError(t, err)
	mon := core.NewRecord(monitors)
	mon.Set("name", "native")
	mon.Set("type", "ping")
	mon.Set("target", "example.com")
	mon.Set("interval", 60)
	mon.Set("timeout", 10)
	mon.Set("users", []string{user.Id})
	require.NoError(t, app.Save(mon))

	rec := core.NewRecord(alerts)
	rec.Set("user", user.Id)
	rec.Set("monitor", mon.Id)
	rec.Set("name", "MonitorStatus")
	rec.Set("value", 1)
	require.NoError(t, app.Save(rec), "monitor alert without system must save")

	require.NoError(t, app.Delete(mon))
	remaining, err := app.FindRecordsByFilter("alerts", "monitor != ''", "", 1, 0)
	require.NoError(t, err)
	assert.Empty(t, remaining, "monitor alerts must cascade-delete")
}
