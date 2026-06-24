use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};

// ── Slug generation ───────────────────────────────────────────────────────────

#[wasm_bindgen]
pub fn generate_slug(keyword: &str) -> String {
    let mut slug = String::new();
    let mut prev_dash = false;

    for ch in keyword.chars() {
        if ch.is_alphanumeric() {
            slug.push(ch.to_ascii_lowercase());
            prev_dash = false;
        } else if ch == ' ' || ch == '-' || ch == '_' {
            if !prev_dash && !slug.is_empty() {
                slug.push('-');
                prev_dash = true;
            }
        }
        // Korean characters kept as-is (percent-encoded at URL layer)
        else if '\u{AC00}' <= ch && ch <= '\u{D7A3}' {
            slug.push(ch);
            prev_dash = false;
        }
    }

    // Trim trailing dash
    if slug.ends_with('-') {
        slug.pop();
    }

    slug
}

// ── Keyword scoring (high-performance batch) ──────────────────────────────────

#[derive(Serialize, Deserialize)]
pub struct KeywordScore {
    pub keyword: String,
    pub longtail_score: u32,
    pub word_count: usize,
    pub char_count: usize,
    pub is_korean: bool,
    pub has_numbers: bool,
    pub complexity: f64,
}

#[wasm_bindgen]
pub fn score_keyword(keyword: &str) -> JsValue {
    let word_count = keyword.split_whitespace().count();
    let char_count = keyword.chars().count();
    let is_korean = keyword.chars().any(|c| '\u{AC00}' <= c && c <= '\u{D7A3}');
    let has_numbers = keyword.chars().any(|c| c.is_numeric());

    let mut longtail = 0u32;
    if word_count >= 3 { longtail += 40; }
    else if word_count == 2 { longtail += 20; }
    if char_count > 8 { longtail += 20; }
    if has_numbers { longtail += 10; }

    let complexity = (word_count as f64 * 0.4 + char_count as f64 * 0.1).min(10.0);

    let result = KeywordScore {
        keyword: keyword.to_string(),
        longtail_score: longtail.min(100),
        word_count,
        char_count,
        is_korean,
        has_numbers,
        complexity,
    };

    serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
}

/// Batch score multiple keywords at once (much faster than calling JS in a loop)
#[wasm_bindgen]
pub fn batch_score_keywords(keywords_json: &str) -> String {
    let keywords: Vec<String> = serde_json::from_str(keywords_json).unwrap_or_default();

    let scores: Vec<KeywordScore> = keywords.iter().map(|kw| {
        let word_count = kw.split_whitespace().count();
        let char_count = kw.chars().count();
        let is_korean = kw.chars().any(|c| '\u{AC00}' <= c && c <= '\u{D7A3}');
        let has_numbers = kw.chars().any(|c| c.is_numeric());

        let mut longtail = 0u32;
        if word_count >= 3 { longtail += 40; }
        else if word_count == 2 { longtail += 20; }
        if char_count > 8 { longtail += 20; }
        if has_numbers { longtail += 10; }

        KeywordScore {
            keyword: kw.clone(),
            longtail_score: longtail.min(100),
            word_count,
            char_count,
            is_korean,
            has_numbers,
            complexity: (word_count as f64 * 0.4 + char_count as f64 * 0.1).min(10.0),
        }
    }).collect();

    serde_json::to_string(&scores).unwrap_or_else(|_| "[]".to_string())
}

// ── Volume normalization ──────────────────────────────────────────────────────

/// Normalize a raw scraped number string like "1,234,567" or "12만" to u64
#[wasm_bindgen]
pub fn parse_korean_number(s: &str) -> f64 {
    let s = s.trim();
    if s.contains('억') {
        let base: f64 = s.replace('억', "").replace(',', "").trim().parse().unwrap_or(0.0);
        return base * 100_000_000.0;
    }
    if s.contains('만') {
        let base: f64 = s.replace('만', "").replace(',', "").trim().parse().unwrap_or(0.0);
        return base * 10_000.0;
    }
    s.replace(',', "").parse::<f64>().unwrap_or(0.0)
}

// ── HTML text extractor ───────────────────────────────────────────────────────

/// Strip HTML tags from a string quickly
#[wasm_bindgen]
pub fn strip_html(html: &str) -> String {
    let mut result = String::with_capacity(html.len());
    let mut in_tag = false;

    for ch in html.chars() {
        match ch {
            '<' => { in_tag = true; }
            '>' => { in_tag = false; }
            _ if !in_tag => { result.push(ch); }
            _ => {}
        }
    }

    // Collapse whitespace
    let mut out = String::new();
    let mut prev_space = false;
    for ch in result.chars() {
        if ch.is_whitespace() {
            if !prev_space { out.push(' '); }
            prev_space = true;
        } else {
            out.push(ch);
            prev_space = false;
        }
    }

    out.trim().to_string()
}

/// Extract numbers from text, return comma-separated
#[wasm_bindgen]
pub fn extract_numbers(text: &str) -> String {
    let nums: Vec<String> = text
        .split(|c: char| !c.is_ascii_digit() && c != ',' && c != '.')
        .filter(|s| !s.is_empty() && s.chars().any(|c| c.is_ascii_digit()))
        .map(|s| s.replace(',', ""))
        .collect();
    nums.join(",")
}

// ── Competition score calculator ──────────────────────────────────────────────

#[wasm_bindgen]
pub fn calc_opportunity(monthly_volume: u32, difficulty: u32, longtail: u32) -> u32 {
    use std::cmp::min;
    let vol_score = min(100, (monthly_volume as f64).log10() as u32 * 15);
    let result = (vol_score as f64 * 0.4 + (100 - difficulty) as f64 * 0.4 + longtail as f64 * 0.2) as u32;
    min(100, result)
}

#[wasm_bindgen]
pub fn calc_difficulty(paid_ads: u32, content_count: u64, avg_da: u32) -> u32 {
    use std::cmp::min;
    let ad_factor = min(40, paid_ads * 8);
    let content_factor = min(40, (content_count as f64 + 1.0).log10() as u32 * 5);
    let da_factor = min(20, avg_da / 5);
    min(100, ad_factor + content_factor + da_factor)
}

// Needed for serde_json when used with batch_score_keywords
extern crate alloc;
