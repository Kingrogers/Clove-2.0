use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Note {
    pub id: String,
    pub title: String,
    pub body: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: u64,
}

fn notes_dir() -> PathBuf {
    let home = dirs::home_dir().expect("could not resolve home directory");
    home.join("Documents").join("Clove")
}

fn ensure_dir() {
    let dir = notes_dir();
    if !dir.exists() {
        fs::create_dir_all(&dir).expect("failed to create Clove notes directory");
    }
}

#[tauri::command]
fn list_notes() -> Result<Vec<Note>, String> {
    ensure_dir();
    let dir = notes_dir();
    let mut notes: Vec<Note> = Vec::new();

    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) == Some("json") {
            let data = fs::read_to_string(&path).map_err(|e| e.to_string())?;
            match serde_json::from_str::<Note>(&data) {
                Ok(note) => notes.push(note),
                Err(_) => continue, // skip malformed files
            }
        }
    }

    // Sort by most recently updated
    notes.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(notes)
}

#[tauri::command]
fn save_note(note: Note) -> Result<(), String> {
    ensure_dir();
    let path = notes_dir().join(format!("{}.json", note.id));
    let data = serde_json::to_string_pretty(&note).map_err(|e| e.to_string())?;
    fs::write(&path, data).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_note(id: String) -> Result<(), String> {
    let path = notes_dir().join(format!("{}.json", id));
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![list_notes, save_note, delete_note])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
