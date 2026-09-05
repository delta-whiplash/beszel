package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// 3_monitor_alerts_native.go wires monitors into the native alerts pipeline.
// New nullable `monitor` relations (cascade delete) on alerts and
// alerts_history let monitor incidents use the same tables, indexes and UI
// as system alerts. alerts.system becomes optional: system alerts always
// carry one (existing rows unchanged), monitor alerts carry a monitor
// instead. alerts.name gains the Monitor* select values.
func init() {
	m.Register(func(app core.App) error {
		monitors, err := app.FindCollectionByNameOrId("monitors")
		if err != nil {
			return err
		}
		alerts, err := app.FindCollectionByNameOrId("alerts")
		if err != nil {
			return err
		}
		alerts.Fields.Add(&core.RelationField{
			Name: "monitor", MaxSelect: 1, MinSelect: 0,
			CollectionId: monitors.Id, CascadeDelete: true,
		})
		if systemField := alerts.Fields.GetByName("system"); systemField != nil {
			if rel, ok := systemField.(*core.RelationField); ok {
				rel.Required = false
			}
		}
		if nameField := alerts.Fields.GetByName("name"); nameField != nil {
			if selField, ok := nameField.(*core.SelectField); ok {
				selField.Values = append(selField.Values, "MonitorStatus", "MonitorLatency", "MonitorCert")
			}
		}
		alerts.AddIndex("idx_alerts_monitor", false, "monitor", "")
		if err := app.Save(alerts); err != nil {
			return err
		}

		history, err := app.FindCollectionByNameOrId("alerts_history")
		if err != nil {
			return err
		}
		history.Fields.Add(&core.RelationField{
			Name: "monitor", MaxSelect: 1, MinSelect: 0,
			CollectionId: monitors.Id, CascadeDelete: true,
		})
		// Monitor history rows carry a monitor instead of a system, like alerts.
		if historySystem := history.Fields.GetByName("system"); historySystem != nil {
			if rel, ok := historySystem.(*core.RelationField); ok {
				rel.Required = false
			}
		}
		history.AddIndex("idx_alerts_history_monitor", false, "monitor", "")
		return app.Save(history)
	}, func(app core.App) error {
		if history, err := app.FindCollectionByNameOrId("alerts_history"); err == nil {
			history.Fields.RemoveByName("monitor")
			if historySystem := history.Fields.GetByName("system"); historySystem != nil {
				if rel, ok := historySystem.(*core.RelationField); ok {
					rel.Required = true
				}
			}
			if err := app.Save(history); err != nil {
				return err
			}
		}
		if alerts, err := app.FindCollectionByNameOrId("alerts"); err == nil {
			alerts.Fields.RemoveByName("monitor")
			if systemField := alerts.Fields.GetByName("system"); systemField != nil {
				if rel, ok := systemField.(*core.RelationField); ok {
					rel.Required = true
				}
			}
			if nameField := alerts.Fields.GetByName("name"); nameField != nil {
				if selField, ok := nameField.(*core.SelectField); ok {
					keep := selField.Values[:0]
					for _, v := range selField.Values {
						if v != "MonitorStatus" && v != "MonitorLatency" && v != "MonitorCert" {
							keep = append(keep, v)
						}
					}
					selField.Values = keep
				}
			}
			return app.Save(alerts)
		}
		return nil
	})
}
