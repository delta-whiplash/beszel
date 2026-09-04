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

func TestMonitorAlertsAndMaintenanceSchema(t *testing.T) {
	app, err := tests.NewTestApp(t.TempDir())
	require.NoError(t, err)
	defer app.Cleanup()

	monitors, err := app.FindCachedCollectionByNameOrId("monitors")
	require.NoError(t, err)
	assert.NotNil(t, monitors.Fields.GetByName("notify_emails"), "monitors.notify_emails must exist")
	assert.NotNil(t, monitors.Fields.GetByName("notify_webhooks"), "monitors.notify_webhooks must exist")

	mw, err := app.FindCachedCollectionByNameOrId("maintenance_windows")
	require.NoError(t, err, "maintenance_windows collection must exist")
	assert.NotNil(t, mw.Fields.GetByName("monitor"))
	assert.NotNil(t, mw.Fields.GetByName("start"))
	assert.NotNil(t, mw.Fields.GetByName("end"))
	assert.NotNil(t, mw.Fields.GetByName("reason"))

	// maintenance rows cascade-delete with their monitor
	users, err := app.FindCachedCollectionByNameOrId("users")
	require.NoError(t, err)
	user := core.NewRecord(users)
	user.Set("email", "mw@example.com")
	user.Set("password", "password12345")
	require.NoError(t, app.Save(user))
	mon := core.NewRecord(monitors)
	mon.Set("name", "mw")
	mon.Set("type", "ping")
	mon.Set("target", "example.com")
	mon.Set("interval", 60)
	mon.Set("timeout", 10)
	mon.Set("users", []string{user.Id})
	require.NoError(t, app.Save(mon))

	mwc, err := app.FindCachedCollectionByNameOrId("maintenance_windows")
	require.NoError(t, err)
	w := core.NewRecord(mwc)
	w.Set("monitor", mon.Id)
	w.Set("start", "2030-01-01 00:00:00.000Z")
	w.Set("end", "2030-01-02 00:00:00.000Z")
	require.NoError(t, app.Save(w))

	require.NoError(t, app.Delete(mon))
	remaining, err := app.CountRecords("maintenance_windows")
	require.NoError(t, err)
	assert.EqualValues(t, 0, remaining, "maintenance must cascade-delete with monitor")
}
