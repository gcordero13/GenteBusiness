import { describe, expect, it } from "vitest";
import { MAINTENANCE_CHECKLIST_ITEMS } from "./maintenanceChecklist";

describe("MAINTENANCE_CHECKLIST_ITEMS", () => {
  it("has exactly the 10 items from the paper form, in order", () => {
    expect(MAINTENANCE_CHECKLIST_ITEMS.map((i) => i.key)).toEqual([
      "restore_point_created",
      "temp_files_cleaned",
      "disk_defragmented",
      "antivirus_updated",
      "windows_updated",
      "agenda_installed",
      "apps_match_profile",
      "wallpaper_installed",
      "keyboard_cleaned",
      "screen_cleaned",
    ]);
  });

  it("has a non-empty Spanish label for every item", () => {
    for (const item of MAINTENANCE_CHECKLIST_ITEMS) {
      expect(item.label.length).toBeGreaterThan(0);
    }
  });
});
