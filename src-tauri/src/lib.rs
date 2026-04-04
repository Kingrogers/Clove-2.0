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
                Err(_) => continue,
            }
        }
    }

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

// ── Claude AI Chat ──

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
struct AnthropicRequest {
    model: String,
    max_tokens: u32,
    system: String,
    messages: Vec<ChatMessage>,
}

#[derive(Debug, Deserialize)]
struct AnthropicResponse {
    content: Vec<ContentBlock>,
}

#[derive(Debug, Deserialize)]
struct ContentBlock {
    text: String,
}

fn api_key_path() -> PathBuf {
    let home = dirs::home_dir().expect("could not resolve home directory");
    home.join(".clove_api_key")
}

#[tauri::command]
fn get_api_key() -> Result<String, String> {
    let path = api_key_path();
    if path.exists() {
        fs::read_to_string(&path)
            .map(|s| s.trim().to_string())
            .map_err(|e| e.to_string())
    } else {
        // Fall back to environment variable
        std::env::var("ANTHROPIC_API_KEY").map_err(|_| "No API key found".to_string())
    }
}

#[tauri::command]
fn save_api_key(key: String) -> Result<(), String> {
    let path = api_key_path();
    fs::write(&path, key.trim()).map_err(|e| e.to_string())
}

#[tauri::command]
async fn chat_with_claude(
    messages: Vec<ChatMessage>,
    note_title: String,
    note_body: String,
) -> Result<String, String> {
    let api_key = get_api_key()?;

    let system = format!(
        "You are a helpful AI assistant embedded in Clove, a note-taking app. \
         The user is currently working on a note and may ask you questions about it, \
         request edits, summaries, or ideas.\n\n\
         --- Current Note ---\n\
         Title: {}\n\n\
         {}\n\
         --- End Note ---\n\n\
         Be concise and helpful. Use markdown formatting in your responses.",
        note_title, note_body
    );

    let request = AnthropicRequest {
        model: "claude-sonnet-4-20250514".to_string(),
        max_tokens: 1024,
        system,
        messages,
    };

    let client = reqwest::Client::new();
    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("API error ({}): {}", status, body));
    }

    let result: AnthropicResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    result
        .content
        .first()
        .map(|c| c.text.clone())
        .ok_or_else(|| "Empty response from Claude".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            list_notes,
            save_note,
            delete_note,
            chat_with_claude,
            get_api_key,
            save_api_key,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
