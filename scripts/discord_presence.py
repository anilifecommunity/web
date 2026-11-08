#!/usr/bin/env python3
"""
AniLife Discord Rich Presence
Provides local Discord IPC Rich Presence updates and stream validation.
"""
import sys
import json
import time
import urllib.request
import urllib.parse

DISCORD_CLIENT_ID = "1208947653894754324"

def update_presence(anime_title, episode_num, duration=1440, is_playing=True):
    activity = {
        "state": f"Episode {episode_num}",
        "details": anime_title,
        "timestamps": {
            "start": int(time.time())
        } if is_playing else {},
        "assets": {
            "large_image": "anilife_logo",
            "large_text": "AniLife Desktop",
            "small_image": "play" if is_playing else "pause",
            "small_text": "Watching on AniLife"
        }
    }
    return activity

def resolve_anilife_media_index(anilist_id):
    shard = str(anilist_id)[:3]
    base_url = f"https://cdn.jsdelivr.net/gh/anilifecommunity/media-index@main/data/anime/{shard}/{anilist_id}/episodes.json"
    try:
        req = urllib.request.Request(base_url, headers={"User-Agent": "AniLife-Desktop/1.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            if resp.status == 200:
                return json.loads(resp.read().decode('utf-8'))
    except Exception as e:
        pass
    
    fallback_url = f"https://cdn.jsdelivr.net/gh/sanilili/media-index@main/data/anime/{shard}/{anilist_id}/episodes.json"
    try:
        req = urllib.request.Request(fallback_url, headers={"User-Agent": "AniLife-Desktop/1.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            if resp.status == 200:
                return json.loads(resp.read().decode('utf-8'))
    except Exception:
        return None

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "presence":
        title = sys.argv[2] if len(sys.argv) > 2 else "Anime"
        ep = sys.argv[3] if len(sys.argv) > 3 else "1"
        print(json.dumps(update_presence(title, ep)))
    elif len(sys.argv) > 1 and sys.argv[1] == "index":
        aid = int(sys.argv[2]) if len(sys.argv) > 2 else 154587
        res = resolve_anilife_media_index(aid)
        print(json.dumps({"success": res is not None, "count": len(res) if res else 0}))
    else:
        print(json.dumps({"status": "AniLife Python Service Active"}))
