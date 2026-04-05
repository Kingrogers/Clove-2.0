use fastembed::{EmbeddingModel, InitOptions, TextEmbedding};
use once_cell::sync::OnceCell;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CachedEmbedding {
    pub vector: Vec<f32>,
    #[serde(rename = "updatedAt")]
    pub updated_at: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchHit {
    pub id: String,
    pub score: f32,
}

static MODEL: OnceCell<TextEmbedding> = OnceCell::new();
static INDEX: OnceCell<Mutex<HashMap<String, CachedEmbedding>>> = OnceCell::new();

fn clove_dir() -> PathBuf {
    let home = dirs::home_dir().expect("could not resolve home directory");
    home.join("Documents").join("Clove")
}

fn cache_dir() -> PathBuf {
    clove_dir().join(".embeddings")
}

fn index_file() -> PathBuf {
    cache_dir().join("index.json")
}

fn model_cache_dir() -> PathBuf {
    cache_dir().join("model")
}

fn ensure_dirs() {
    let _ = fs::create_dir_all(cache_dir());
    let _ = fs::create_dir_all(model_cache_dir());
}

fn load_index_from_disk() -> HashMap<String, CachedEmbedding> {
    let path = index_file();
    if !path.exists() {
        return HashMap::new();
    }
    match fs::read_to_string(&path) {
        Ok(data) => serde_json::from_str(&data).unwrap_or_default(),
        Err(_) => HashMap::new(),
    }
}

fn save_index_to_disk(index: &HashMap<String, CachedEmbedding>) -> Result<(), String> {
    ensure_dirs();
    let data = serde_json::to_string(index).map_err(|e| e.to_string())?;
    fs::write(index_file(), data).map_err(|e| e.to_string())?;
    Ok(())
}

fn get_index() -> &'static Mutex<HashMap<String, CachedEmbedding>> {
    INDEX.get_or_init(|| Mutex::new(load_index_from_disk()))
}

fn get_model() -> Result<&'static TextEmbedding, String> {
    if let Some(m) = MODEL.get() {
        return Ok(m);
    }
    ensure_dirs();
    let model = TextEmbedding::try_new(
        InitOptions::new(EmbeddingModel::AllMiniLML6V2Q)
            .with_cache_dir(model_cache_dir())
            .with_show_download_progress(false),
    )
    .map_err(|e| format!("failed to init embedding model: {}", e))?;
    let _ = MODEL.set(model);
    MODEL.get().ok_or_else(|| "model init race".to_string())
}

fn embed_one(text: &str) -> Result<Vec<f32>, String> {
    let model = get_model()?;
    let trimmed: String = text.chars().take(4000).collect();
    let input = if trimmed.trim().is_empty() {
        " ".to_string()
    } else {
        trimmed
    };
    let vectors = model
        .embed(vec![input], None)
        .map_err(|e| format!("embed failed: {}", e))?;
    vectors
        .into_iter()
        .next()
        .ok_or_else(|| "no embedding returned".to_string())
}

fn note_text(title: &str, body: &str) -> String {
    format!("{}\n\n{}", title, body)
}

fn cosine(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let mut dot = 0.0f32;
    let mut na = 0.0f32;
    let mut nb = 0.0f32;
    for i in 0..a.len() {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    let denom = na.sqrt() * nb.sqrt();
    if denom == 0.0 {
        0.0
    } else {
        dot / denom
    }
}

/// Update (or insert) the embedding for a note. Persists the index.
pub fn upsert_note(
    note_id: &str,
    title: &str,
    body: &str,
    updated_at: u64,
) -> Result<(), String> {
    let text = note_text(title, body);
    let vector = embed_one(&text)?;
    let index = get_index();
    {
        let mut guard = index.lock().map_err(|e| e.to_string())?;
        guard.insert(
            note_id.to_string(),
            CachedEmbedding { vector, updated_at },
        );
        save_index_to_disk(&guard)?;
    }
    Ok(())
}

/// Remove a note's embedding from the index.
pub fn remove_note(note_id: &str) -> Result<(), String> {
    let index = get_index();
    let mut guard = index.lock().map_err(|e| e.to_string())?;
    if guard.remove(note_id).is_some() {
        save_index_to_disk(&guard)?;
    }
    Ok(())
}

/// Incrementally rebuild: re-embed notes whose updated_at is newer than the cached entry
/// (or that aren't cached at all), and drop cached entries for notes that no longer exist.
pub fn sync_index(notes: &[(String, String, String, u64)]) -> Result<usize, String> {
    let current_ids: std::collections::HashSet<String> =
        notes.iter().map(|(id, _, _, _)| id.clone()).collect();

    let stale: Vec<(String, String, String, u64)> = {
        let index = get_index();
        let guard = index.lock().map_err(|e| e.to_string())?;
        notes
            .iter()
            .filter(|(id, _, _, updated_at)| match guard.get(id) {
                Some(cached) => cached.updated_at < *updated_at,
                None => true,
            })
            .cloned()
            .collect()
    };

    let mut updated = 0usize;
    for (id, title, body, updated_at) in &stale {
        if upsert_note(id, title, body, *updated_at).is_ok() {
            updated += 1;
        }
    }

    // drop removed notes
    {
        let index = get_index();
        let mut guard = index.lock().map_err(|e| e.to_string())?;
        let to_remove: Vec<String> = guard
            .keys()
            .filter(|k| !current_ids.contains(*k))
            .cloned()
            .collect();
        let had_removals = !to_remove.is_empty();
        for k in to_remove {
            guard.remove(&k);
        }
        if had_removals {
            save_index_to_disk(&guard)?;
        }
    }

    Ok(updated)
}

/// Semantic search. Returns top-K hits by cosine similarity.
pub fn search(query: &str, limit: usize) -> Result<Vec<SearchHit>, String> {
    let query_vec = embed_one(query)?;
    let index = get_index();
    let guard = index.lock().map_err(|e| e.to_string())?;
    let mut results: Vec<SearchHit> = guard
        .iter()
        .map(|(id, emb)| SearchHit {
            id: id.clone(),
            score: cosine(&query_vec, &emb.vector),
        })
        .collect();
    results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    results.truncate(limit);
    Ok(results)
}

/// Check if the index is ready (has at least been initialized from disk).
pub fn index_size() -> usize {
    let index = get_index();
    index.lock().map(|g| g.len()).unwrap_or(0)
}
