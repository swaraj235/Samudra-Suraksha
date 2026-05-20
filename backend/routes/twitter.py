"""
backend/routes/twitter.py
--------------------------
Multi-source coastal hazard intelligence pipeline.
- Pulls data from multiple sources (Twitter/Gopher, Reddit, Google News RSS, Hacker News)
- Runs Gemini analysis when available, otherwise keyword fallback
- Exposes the same async job API used by the frontend:
  - POST /api/twitter/search
  - GET  /api/twitter/result/<job_uuid>
"""
import json
import logging
import random
import re
import threading
import time
import urllib.parse
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import feedparser
import requests
from flask import Blueprint, jsonify, request

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from config import GEMINI_API_KEY, GEMINI_MODEL, GOPHER_API_URL, GOPHER_AUTH_TOKEN

twitter_bp = Blueprint("twitter", __name__)
logger = logging.getLogger(__name__)

USER_AGENT = "SamudraSuraksha/1.0 (+coastal-hazard-monitor)"
DEFAULT_QUERY = "coastal hazard india flood cyclone tsunami warning"

# ── In-memory job store ──────────────────────────────────────────────────────
_jobs: dict = {}

# ── Indian coastal states for geo-tagging ───────────────────────────────────
COASTAL_STATES = {
    "KERALA":          (10.8505, 76.2711),
    "TAMIL NADU":      (11.1271, 78.6569),
    "ANDHRA PRADESH":  (15.9129, 79.7400),
    "ODISHA":          (20.9517, 85.0985),
    "WEST BENGAL":     (22.9868, 87.8550),
    "GUJARAT":         (22.2587, 71.1924),
    "MAHARASHTRA":     (19.7515, 75.7139),
    "GOA":             (15.2993, 74.1240),
    "KARNATAKA":       (15.3173, 75.7139),
    "LAKSHADWEEP":     (10.5667, 72.6417),
    "ANDAMAN":         (11.7401, 92.6586),
    "PUDUCHERRY":      (11.9416, 79.8083),
}

DEFAULT_NEWS_QUERIES = [
    "flood india coastal",
    "cyclone india warning",
    "tsunami india alert",
    "INCOIS wave alert india",
    "IMD coastal warning india",
]

SUPPORTED_SOURCES = {"twitter", "reddit", "news", "hackernews"}


def _safe_text(value: Any, max_len: int = 800) -> str:
    text = re.sub(r"<[^>]+>", " ", str(value or ""))
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_len]


def _to_iso(value: Any) -> str:
    if value is None:
        return datetime.now(timezone.utc).isoformat()
    try:
        if isinstance(value, (int, float)):
            return datetime.fromtimestamp(float(value), tz=timezone.utc).isoformat()
        if isinstance(value, str) and value.strip():
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed.astimezone(timezone.utc).isoformat()
    except Exception:
        pass
    return datetime.now(timezone.utc).isoformat()


def _extract_region(text: str) -> tuple:
    upper = text.upper()
    for state, coords in COASTAL_STATES.items():
        if state in upper:
            return state, coords
    return "INDIA", (20.5937, 78.9629)


def _extract_hashtags(text: str) -> List[str]:
    return list(dict.fromkeys(re.findall(r"#\w+", text or "")))


def _keyword_analyze(text: str) -> dict:
    lower = text.lower()

    hazard = "other"
    for h, words in {
        "flood":   ["flood", "inundation", "waterlogging", "बाढ़"],
        "tsunami": ["tsunami", "tidal wave", "सुनामी"],
        "storm":   ["cyclone", "storm", "hurricane", "तूफान"],
        "waves":   ["wave", "surge", "swell", "high sea"],
        "erosion": ["erosion", "coastal erosion"],
    }.items():
        if any(w in lower for w in words):
            hazard = h
            break

    urgency = "low"
    if any(w in lower for w in ["emergency", "evacuate", "danger", "rescue", "red alert", "sos"]):
        urgency = "high"
    elif any(w in lower for w in ["warning", "alert", "watch", "cyclone", "tsunami", "heavy rain"]):
        urgency = "medium"

    sentiment = "neutral"
    if any(w in lower for w in ["safe", "relief", "rescued", "restored", "recede"]):
        sentiment = "positive"
    elif any(w in lower for w in ["dead", "death", "damage", "loss", "crisis", "fear", "panic", "stranded"]):
        sentiment = "negative"

    category = "Observation/Neutral Report"
    if urgency == "high":
        category = "Emergency/Alert"
    elif any(w in lower for w in ["official", "incois", "imd", "ndrf", "government", "ministry"]):
        category = "Awareness/Official Info"

    region, coords = _extract_region(text)
    return {
        "hazard_type": hazard,
        "urgency": urgency,
        "sentiment": sentiment,
        "category": category,
        "confidence": 0.62,
        "misinfo_flag": False,
        "misinfo_reason": "",
        "location_region": region,
        "hashtags": _extract_hashtags(text),
        "_coords": coords,
    }


def _gemini_analyze(text: str) -> Optional[dict]:
    if not GEMINI_API_KEY or GEMINI_API_KEY.strip() == "":
        return None
    try:
        prompt = f"""You are a coastal hazard analyst for INCOIS India.
Analyze this social/news post in JSON only:
{{
  "hazard_type": "flood|tsunami|waves|erosion|storm|other",
  "urgency": "high|medium|low",
  "sentiment": "positive|neutral|negative",
  "category": "Emergency/Alert|Observation/Neutral Report|Panic/Fear|Awareness/Official Info",
  "location_region": "STATE NAME IN CAPS (e.g. KERALA) or INDIA",
  "confidence": 0.0-1.0,
  "misinfo_flag": false,
  "misinfo_reason": ""
}}

Text: "{text[:500]}" """

        resp = requests.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}",
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.1, "response_mime_type": "application/json"},
            },
            timeout=10,
        )
        resp.raise_for_status()
        raw = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
        clean = raw.replace("```json", "").replace("```", "").strip()
        result = json.loads(clean)
        region = result.get("location_region", "INDIA").upper()
        coords = COASTAL_STATES.get(region, (20.5937, 78.9629))
        result["_coords"] = coords
        return result
    except Exception as e:
        logger.debug(f"Gemini analysis failed: {e}")
        return None


def _build_google_news_url(query: str) -> str:
    encoded = urllib.parse.quote(query)
    return f"https://news.google.com/rss/search?q={encoded}&hl=en-IN&gl=IN&ceid=IN:en"


def _fetch_google_news(query: str, max_results: int) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    seen = set()

    if query and query.strip():
        feed_urls = [_build_google_news_url(query if "india" in query.lower() else f"{query} india")]
    else:
        feed_urls = [_build_google_news_url(q) for q in DEFAULT_NEWS_QUERIES]

    for feed_url in feed_urls:
        if len(results) >= max_results:
            break
        try:
            feed = feedparser.parse(feed_url)
            for entry in getattr(feed, "entries", []):
                if len(results) >= max_results:
                    break
                title = _safe_text(entry.get("title", ""), 220)
                summary = _safe_text(entry.get("summary", entry.get("description", "")), 450)
                if len(title) < 8:
                    continue
                sig = f"{title.lower()}::{entry.get('link', '')}"
                if sig in seen:
                    continue
                seen.add(sig)
                published = entry.get("published_parsed") or entry.get("updated_parsed")
                if published:
                    created_at = datetime(*published[:6], tzinfo=timezone.utc).isoformat()
                else:
                    created_at = datetime.now(timezone.utc).isoformat()
                content = f"{title}. {summary}".strip()
                results.append({
                    "id": str(uuid.uuid4()),
                    "content": content,
                    "username": _safe_text(getattr(feed, "feed", {}).get("title", "Google News"), 60),
                    "source": "news",
                    "created_at": created_at,
                    "url": entry.get("link", ""),
                    "retweet_count": 0,
                    "like_count": 0,
                    "reply_count": 0,
                    "hashtags": _extract_hashtags(content),
                })
        except Exception as e:
            logger.warning(f"Google News fetch failed: {e}")
    return results


def _fetch_reddit(query: str, max_results: int) -> List[Dict[str, Any]]:
    try:
        q = query.strip() if query else DEFAULT_QUERY
        resp = requests.get(
            "https://www.reddit.com/search.json",
            params={"q": q, "sort": "new", "limit": max_results},
            headers={"User-Agent": USER_AGENT},
            timeout=12,
        )
        resp.raise_for_status()
        payload = resp.json()
        posts = payload.get("data", {}).get("children", [])
        results = []
        for p in posts:
            row = p.get("data", {})
            title = _safe_text(row.get("title", ""), 220)
            body = _safe_text(row.get("selftext", ""), 420)
            content = f"{title}. {body}".strip()
            if len(content) < 12:
                continue
            permalink = row.get("permalink", "")
            results.append({
                "id": str(uuid.uuid4()),
                "content": content,
                "username": f"r/{row.get('subreddit', 'news')}",
                "source": "reddit",
                "created_at": _to_iso(row.get("created_utc")),
                "url": f"https://www.reddit.com{permalink}" if permalink else "",
                "retweet_count": 0,
                "like_count": int(row.get("score", 0) or 0),
                "reply_count": int(row.get("num_comments", 0) or 0),
                "hashtags": _extract_hashtags(content),
            })
        return results
    except Exception as e:
        logger.warning(f"Reddit fetch failed: {e}")
        return []


def _fetch_hackernews(query: str, max_results: int) -> List[Dict[str, Any]]:
    try:
        q = query.strip() if query else DEFAULT_QUERY
        resp = requests.get(
            "https://hn.algolia.com/api/v1/search_by_date",
            params={"query": q, "hitsPerPage": max_results},
            headers={"User-Agent": USER_AGENT},
            timeout=12,
        )
        resp.raise_for_status()
        payload = resp.json()
        hits = payload.get("hits", [])
        results = []
        for item in hits:
            title = _safe_text(item.get("title") or item.get("story_title") or "", 220)
            body = _safe_text(item.get("story_text") or item.get("comment_text") or "", 420)
            content = f"{title}. {body}".strip()
            if len(content) < 12:
                continue
            results.append({
                "id": str(uuid.uuid4()),
                "content": content,
                "username": f"HN/{_safe_text(item.get('author', 'unknown'), 40)}",
                "source": "hackernews",
                "created_at": _to_iso(item.get("created_at")),
                "url": item.get("url") or item.get("story_url") or "",
                "retweet_count": 0,
                "like_count": int(item.get("points", 0) or 0),
                "reply_count": int(item.get("num_comments", 0) or 0),
                "hashtags": _extract_hashtags(content),
            })
        return results
    except Exception as e:
        logger.warning(f"Hacker News fetch failed: {e}")
        return []


def _extract_candidate_list(payload: Any) -> List[Dict[str, Any]]:
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    if isinstance(payload, dict):
        for key in ("results", "data", "tweets", "items", "posts"):
            value = payload.get(key)
            if isinstance(value, list):
                return [x for x in value if isinstance(x, dict)]
            if isinstance(value, dict):
                nested = _extract_candidate_list(value)
                if nested:
                    return nested
        for value in payload.values():
            if isinstance(value, list):
                return [x for x in value if isinstance(x, dict)]
    return []


def _fetch_gopher_twitter(query: str, max_results: int) -> List[Dict[str, Any]]:
    if not GOPHER_AUTH_TOKEN:
        return []
    try:
        payload = {
            "query": query.strip() if query else DEFAULT_QUERY,
            "max_results": max_results,
        }
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {GOPHER_AUTH_TOKEN}",
            "X-Auth-Token": GOPHER_AUTH_TOKEN,
            "User-Agent": USER_AGENT,
        }
        resp = requests.post(GOPHER_API_URL, json=payload, headers=headers, timeout=14)
        resp.raise_for_status()
        rows = _extract_candidate_list(resp.json())
        results = []
        for r in rows:
            text = _safe_text(
                r.get("content") or r.get("text") or r.get("full_text") or r.get("tweet") or r.get("body"),
                700,
            )
            if len(text) < 8:
                continue
            user = r.get("user", {}) if isinstance(r.get("user"), dict) else {}
            username = _safe_text(
                r.get("username")
                or user.get("username")
                or user.get("screen_name")
                or "twitter_source",
                60,
            )
            created = r.get("created_at") or r.get("createdAt") or r.get("timestamp")
            lat = r.get("lat") or r.get("latitude")
            lng = r.get("lng") or r.get("longitude")
            try:
                lat = float(lat) if lat is not None else None
                lng = float(lng) if lng is not None else None
            except Exception:
                lat, lng = None, None
            results.append({
                "id": str(uuid.uuid4()),
                "content": text,
                "username": username,
                "source": "twitter",
                "created_at": _to_iso(created),
                "url": r.get("url") or r.get("link") or "",
                "retweet_count": int(r.get("retweet_count") or r.get("retweets") or 0),
                "like_count": int(r.get("like_count") or r.get("likes") or 0),
                "reply_count": int(r.get("reply_count") or r.get("replies") or 0),
                "lat": lat,
                "lng": lng,
                "hashtags": _extract_hashtags(text),
            })
        return results[:max_results]
    except Exception as e:
        logger.warning(f"Gopher/Twitter fetch failed: {e}")
        return []


def _enrich_posts(raw_posts: List[Dict[str, Any]], max_results: int) -> List[Dict[str, Any]]:
    results = []
    seen = set()
    for item in raw_posts:
        if len(results) >= max_results:
            break
        content = _safe_text(item.get("content", ""), 900)
        if len(content) < 8:
            continue
        sig = content.lower()[:220]
        if sig in seen:
            continue
        seen.add(sig)

        analysis = _gemini_analyze(content) or _keyword_analyze(content)
        coords = analysis.pop("_coords", (20.5937, 78.9629))
        lat = item.get("lat")
        lng = item.get("lng")
        if lat is None or lng is None:
            lat = float(coords[0]) + random.uniform(-0.8, 0.8)
            lng = float(coords[1]) + random.uniform(-0.8, 0.8)

        hashtags = item.get("hashtags") if isinstance(item.get("hashtags"), list) else []
        hashtags = list(dict.fromkeys(hashtags + analysis.get("hashtags", [])))

        results.append({
            "id": item.get("id") or str(uuid.uuid4()),
            "content": content,
            "username": _safe_text(item.get("username", "Source"), 80),
            "source": item.get("source", "news"),
            "created_at": _to_iso(item.get("created_at")),
            "url": item.get("url", ""),
            "retweet_count": int(item.get("retweet_count", 0) or 0),
            "like_count": int(item.get("like_count", 0) or 0),
            "reply_count": int(item.get("reply_count", 0) or 0),
            "lat": float(lat),
            "lng": float(lng),
            "hashtags": hashtags,
            **analysis,
        })
        time.sleep(0.04)

    return results


def _demo_data() -> list:
    return [
        {
            "id": str(uuid.uuid4()),
            "content": "INCOIS issues high wave alert for Kerala coast. Fishermen advised not to venture into sea due to rough conditions. IMD cyclone watch active.",
            "username": "INCOIS_Official",
            "source": "demo",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "hazard_type": "waves",
            "urgency": "high",
            "sentiment": "neutral",
            "category": "Awareness/Official Info",
            "confidence": 0.92,
            "location_region": "KERALA",
            "lat": 10.85,
            "lng": 76.27,
            "misinfo_flag": False,
            "misinfo_reason": "",
            "hashtags": ["#Kerala", "#CoastalAlert"],
            "retweet_count": 0,
            "like_count": 0,
            "reply_count": 0,
            "url": "",
        },
        {
            "id": str(uuid.uuid4()),
            "content": "Reddit users report heavy coastal flooding in Odisha districts after overnight rain. Authorities issued evacuation notices.",
            "username": "r/indiaweather",
            "source": "reddit",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "hazard_type": "flood",
            "urgency": "high",
            "sentiment": "negative",
            "category": "Emergency/Alert",
            "confidence": 0.89,
            "location_region": "ODISHA",
            "lat": 20.95,
            "lng": 85.09,
            "misinfo_flag": False,
            "misinfo_reason": "",
            "hashtags": ["#OdishaFlood"],
            "retweet_count": 0,
            "like_count": 25,
            "reply_count": 7,
            "url": "",
        },
    ]


def _fetch_and_analyze(job_uuid: str, query: str, max_results: int, sources: List[str]):
    source_limit = min(max(10, max_results), 40)
    raw_posts: List[Dict[str, Any]] = []

    if "twitter" in sources:
        raw_posts.extend(_fetch_gopher_twitter(query, source_limit))
    if "reddit" in sources:
        raw_posts.extend(_fetch_reddit(query, source_limit))
    if "news" in sources:
        raw_posts.extend(_fetch_google_news(query, source_limit))
    if "hackernews" in sources:
        raw_posts.extend(_fetch_hackernews(query, source_limit))

    results = _enrich_posts(raw_posts, max_results)
    if not results:
        logger.warning(f"No source data fetched for job {job_uuid}; using demo data")
        results = _demo_data()[:max_results]

    _jobs[job_uuid] = {"status": "done", "results": results}
    logger.info(f"Job {job_uuid} complete: {len(results)} posts")


@twitter_bp.route("/api/twitter/search", methods=["POST"])
def twitter_search():
    data = request.get_json(silent=True) or {}
    query = data.get("query", "").strip()
    max_results = min(int(data.get("max_results", 20)), 60)

    requested_sources = data.get("sources")
    if isinstance(requested_sources, list):
        normalized = [str(s).strip().lower() for s in requested_sources]
        sources = [s for s in normalized if s in SUPPORTED_SOURCES]
        if not sources:
            sources = sorted(SUPPORTED_SOURCES)
    else:
        sources = sorted(SUPPORTED_SOURCES)

    job_uuid = str(uuid.uuid4())
    _jobs[job_uuid] = {"status": "pending", "results": []}

    t = threading.Thread(
        target=_fetch_and_analyze,
        args=(job_uuid, query, max_results, sources),
        daemon=True,
    )
    t.start()

    logger.info(f"Started job {job_uuid} query='{query[:80]}' sources={sources}")
    return jsonify({"jobUUID": job_uuid})


@twitter_bp.route("/api/twitter/result/<job_uuid>", methods=["GET"])
def twitter_result(job_uuid):
    job = _jobs.get(job_uuid)
    if not job:
        return jsonify({"error": "Job not found"}), 404

    if job["status"] == "pending":
        return jsonify({"status": "pending", "results": []})

    results = job.get("results", [])

    if len(_jobs) > 100:
        oldest = list(_jobs.keys())[0]
        _jobs.pop(oldest, None)

    return jsonify({"status": "done", "results": results, "count": len(results)})