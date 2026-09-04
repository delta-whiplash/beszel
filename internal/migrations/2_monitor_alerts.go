package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

// 2_monitor_alerts.go adds per-monitor notification channels and planned
// maintenance windows. During maintenance, checks keep running and history
// is recorded, but notifications are suppressed.
func init() {
	m.Register(func(app core.App) error {
		monitors, err := app.FindCollectionByNameOrId("monitors")
		if err != nil {
			return err
		}
		monitors.Fields.Add(
			// Subsets of the owner's channels; empty = inherit all.
			&core.JSONField{Name: "notify_emails"},
			&core.JSONField{Name: "notify_webhooks"},
		)
		if err := app.Save(monitors); err != nil {
			return err
		}

		windows := core.NewBaseCollection("maintenance_windows")
		windows.Fields.Add(
			&core.TextField{Name: "reason", Max: 200},
			&core.DateField{Name: "start", Required: true},
			&core.DateField{Name: "end", Required: true},
			&core.AutodateField{Name: "created", OnCreate: true},
			&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
		)
		windows.Fields.Add(&core.RelationField{
			Name: "monitor", Required: true, MaxSelect: 1,
			CollectionId: monitors.Id, CascadeDelete: true,
		})
		// Same access as the parent monitor; server never writes these.
		windows.ListRule = types.Pointer("@request.auth.id != \"\" && monitor.users.id ?= @request.auth.id")
		windows.ViewRule = types.Pointer("@request.auth.id != \"\" && monitor.users.id ?= @request.auth.id")
		windows.CreateRule = types.Pointer("@request.auth.id != \"\" && monitor.users.id ?= @request.auth.id && @request.auth.role != \"readonly\"")
		windows.UpdateRule = types.Pointer("@request.auth.id != \"\" && monitor.users.id ?= @request.auth.id && @request.auth.role != \"readonly\"")
		windows.DeleteRule = types.Pointer("@request.auth.id != \"\" && monitor.users.id ?= @request.auth.id && @request.auth.role != \"readonly\"")
		windows.AddIndex("idx_mw_monitor", false, "monitor, start, end", "")
		return app.Save(windows)
	}, func(app core.App) error {
		if windows, err := app.FindCollectionByNameOrId("maintenance_windows"); err == nil {
			if err := app.Delete(windows); err != nil {
				return err
			}
		}
		if monitors, err := app.FindCollectionByNameOrId("monitors"); err == nil {
			monitors.Fields.RemoveByName("notify_emails")
			monitors.Fields.RemoveByName("notify_webhooks")
			return app.Save(monitors)
		}
		return nil
	})
}
