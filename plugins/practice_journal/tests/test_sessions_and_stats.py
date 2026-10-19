"""Session recording and aggregate/song-scoped stats."""

from datetime import datetime, timedelta

from conftest import record

STATS = "/api/plugins/practice_journal/stats"


def test_record_requires_filename(client):
    assert record(client, "").json() == {"error": "No filename"}


def test_record_skips_sessions_under_5_seconds(client):
    r = record(client, "song.sloppak", duration=4)
    assert r.json() == {"ok": True, "skipped": True}
    assert record(client, "song.sloppak", duration=5).json() == {"ok": True}


def test_record_persists_and_appears_in_stats(client):
    record(client, "song.sloppak", duration=120, title="Song", artist="Artist")
    body = client.get(STATS).json()
    assert body["total_time"] == 120
    assert body["total_sessions"] == 1
    assert body["unique_songs"] == 1
    assert body["recent"][0]["title"] == "Song"


def test_stats_empty_database(client):
    body = client.get(STATS).json()
    assert body["total_time"] == 0
    assert body["total_sessions"] == 0
    assert body["unique_songs"] == 0
    assert body["top_songs"] == []
    assert body["recent"] == []


def test_stats_today_and_week_windows(client):
    now = datetime.utcnow()
    record(client, "a.sloppak", duration=100, started_at=now.isoformat())
    record(client, "b.sloppak", duration=50,
           started_at=(now - timedelta(days=10)).isoformat())  # outside week window

    body = client.get(STATS).json()
    assert body["today_time"] == 100
    assert body["week_time"] == 100
    assert body["total_time"] == 150


def test_stats_top_songs_ordered_by_total_time(client):
    record(client, "a.sloppak", duration=30, title="A")
    record(client, "b.sloppak", duration=200, title="B")
    record(client, "a.sloppak", duration=30, title="A")  # a's total now 60

    top = client.get(STATS).json()["top_songs"]
    assert top[0]["filename"] == "b.sloppak"
    assert top[0]["total_time"] == 200
    assert top[1]["filename"] == "a.sloppak"
    assert top[1]["total_time"] == 60
    assert top[1]["sessions"] == 2


def test_stats_unique_songs_counts_distinct_filenames(client):
    record(client, "a.sloppak", duration=10)
    record(client, "a.sloppak", duration=10)
    record(client, "b.sloppak", duration=10)
    assert client.get(STATS).json()["unique_songs"] == 2


def test_stats_recent_ordered_newest_first_and_capped(client):
    base = datetime.utcnow()
    for i in range(3):
        record(client, f"song{i}.sloppak", duration=10,
               started_at=(base + timedelta(minutes=i)).isoformat())
    recent = client.get(STATS).json()["recent"]
    assert [r["filename"] for r in recent] == ["song2.sloppak", "song1.sloppak", "song0.sloppak"]


def test_stats_daily_groups_by_date_within_30_days(client):
    now = datetime.utcnow()
    record(client, "a.sloppak", duration=60, started_at=now.isoformat())
    record(client, "b.sloppak", duration=40, started_at=now.isoformat())
    record(client, "old.sloppak", duration=999,
           started_at=(now - timedelta(days=40)).isoformat())  # excluded

    daily = client.get(STATS).json()["daily"]
    assert len(daily) == 1
    assert daily[0]["seconds"] == 100


# ── Per-song history ────────────────────────────────────────────────────────

def test_song_history_empty_for_unknown_filename(client):
    r = client.get("/api/plugins/practice_journal/song/nope.sloppak")
    body = r.json()
    assert body["total_time"] == 0
    assert body["session_count"] == 0
    assert body["sessions"] == []


def test_song_history_aggregates_and_orders(client):
    now = datetime.utcnow()
    record(client, "song.sloppak", duration=60, avg_speed=0.8, started_at=now.isoformat())
    record(client, "song.sloppak", duration=90, avg_speed=1.0,
           started_at=(now + timedelta(minutes=5)).isoformat())
    record(client, "other.sloppak", duration=30)

    body = client.get("/api/plugins/practice_journal/song/song.sloppak").json()
    assert body["total_time"] == 150
    assert body["session_count"] == 2
    assert [s["speed"] for s in body["speed_history"]] == [0.8, 1.0]  # chronological
    assert body["sessions"][0]["duration"] == 90  # most recent first


def test_song_history_decodes_loops_used(client):
    record(client, "song.sloppak", duration=60, loops_used=[{"start": 1, "end": 2}])
    sessions = client.get("/api/plugins/practice_journal/song/song.sloppak").json()["sessions"]
    assert sessions[0]["loops"] == [{"start": 1, "end": 2}]
