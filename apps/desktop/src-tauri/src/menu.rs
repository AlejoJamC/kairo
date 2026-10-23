//! Native menu bar built from the JSON the dashboard produces (`buildAppMenu`
//! in `@kairo/ui`). The OS draws it; every item the person picks goes back to
//! the webview as a `kairo-menu` event carrying the item id.

use serde_json::Value;
use tauri::menu::{CheckMenuItemBuilder, Menu, MenuBuilder, MenuItemBuilder, Submenu, SubmenuBuilder};
use tauri::{AppHandle, Runtime};

fn str_of<'a>(value: &'a Value, key: &str) -> &'a str {
    value.get(key).and_then(Value::as_str).unwrap_or("")
}

fn bool_of(value: &Value, key: &str) -> Option<bool> {
    value.get(key).and_then(Value::as_bool)
}

/// Adds one menu entry to `builder`: separators, checkboxes and single-choice
/// items (a checkmark), nested submenus, the system items (Undo, Copy, Quit…)
/// and plain items that report their id when picked.
fn add_items<'a, R: Runtime>(
    app: &'a AppHandle<R>,
    mut builder: SubmenuBuilder<'a, R, AppHandle<R>>,
    items: &[Value],
) -> tauri::Result<SubmenuBuilder<'a, R, AppHandle<R>>> {
    for item in items {
        let id = str_of(item, "id");
        let label = str_of(item, "label");
        builder = match str_of(item, "kind") {
            "separator" => builder.separator(),
            "checkbox" => {
                let entry = CheckMenuItemBuilder::with_id(id, label)
                    .checked(bool_of(item, "checked").unwrap_or(false))
                    .build(app)?;
                builder.item(&entry)
            }
            "submenu" => {
                let children = item.get("items").and_then(Value::as_array).cloned().unwrap_or_default();
                let sub = build_submenu(app, id, label, &children)?;
                builder.item(&sub)
            }
            _ => match id {
                "undo" => builder.undo(),
                "redo" => builder.redo(),
                "cut" => builder.cut(),
                "copy" => builder.copy(),
                "paste" => builder.paste(),
                "select-all" => builder.select_all(),
                "minimize" => builder.minimize(),
                "zoom" => builder.maximize(),
                "quit" => builder.quit(),
                _ => {
                    let enabled = !bool_of(item, "disabled").unwrap_or(false);
                    if let Some(checked) = bool_of(item, "checked") {
                        let entry = CheckMenuItemBuilder::with_id(id, label).checked(checked).enabled(enabled).build(app)?;
                        builder.item(&entry)
                    } else {
                        let mut entry = MenuItemBuilder::with_id(id, label).enabled(enabled);
                        if let Some(accelerator) = item.get("accelerator").and_then(Value::as_str) {
                            entry = entry.accelerator(accelerator);
                        }
                        builder.item(&entry.build(app)?)
                    }
                }
            },
        };
    }
    Ok(builder)
}

fn build_submenu<R: Runtime>(app: &AppHandle<R>, id: &str, label: &str, items: &[Value]) -> tauri::Result<Submenu<R>> {
    add_items(app, SubmenuBuilder::with_id(app, id, label), items)?.build()
}

/// Builds the menu bar from the groups JSON.
pub fn build_menu<R: Runtime>(app: &AppHandle<R>, groups_json: &str) -> Result<Menu<R>, String> {
    let groups: Vec<Value> = serde_json::from_str(groups_json).map_err(|err| err.to_string())?;
    let mut bar = MenuBuilder::new(app);
    for group in &groups {
        let items = group.get("items").and_then(Value::as_array).cloned().unwrap_or_default();
        let submenu = build_submenu(app, str_of(group, "id"), str_of(group, "label"), &items).map_err(|err| err.to_string())?;
        bar = bar.item(&submenu);
    }
    bar.build().map_err(|err| err.to_string())
}
