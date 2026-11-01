"""Loose-folder clip start: the first chorus from the chart sections, and
the start_hint path of build_preview_from_audio_file. No ffmpeg needed."""

import pytest

import backfill


def _chart(song_dir, name, sections, after_levels=()):
    """Write a Rocksmith arrangement XML with these (name, startTime) sections."""
    song_dir.mkdir(parents=True, exist_ok=True)
    rows = "".join(
        f'<section name="{n}" number="1" startTime="{t}" />' for n, t in sections
    )
    late = "".join(
        f'<section name="{n}" number="1" startTime="{t}" />' for n, t in after_levels
    )
    (song_dir / name).write_text(
        f'<song version="7"><title>T</title><sections count="{len(sections)}">'
        f"{rows}</sections><levels><level difficulty=\"0\">{late}</level></levels></song>",
        encoding="utf-8",
    )


def test_first_chorus_with_lead_in(tmp_path):
    d = tmp_path / "Song"
    _chart(d, "arr_lead_RS2.xml", [
        ("intro", 0.5), ("verse", 20.0), ("prechorus", 40.0),
        ("chorus", 90.0), ("chorus", 50.0),
    ])
    start, reason = backfill.loose_chorus_start(d)
    assert start == pytest.approx(50.0 - backfill.CHORUS_LEAD_IN_SECONDS)
    assert reason == "first chorus section at 50.0s"


def test_numbered_chorus_counts(tmp_path):
    d = tmp_path / "Song"
    _chart(d, "arr_lead_RS2.xml", [("verse", 10.0), ("Chorus2", 70.0)])
    start, _reason = backfill.loose_chorus_start(d)
    assert start == pytest.approx(70.0 - backfill.CHORUS_LEAD_IN_SECONDS)


def test_hook_when_no_chorus(tmp_path):
    d = tmp_path / "Song"
    _chart(d, "arr_lead_RS2.xml", [("verse", 10.0), ("hook", 60.0), ("postchorus", 30.0)])
    start, reason = backfill.loose_chorus_start(d)
    assert start == pytest.approx(60.0 - backfill.CHORUS_LEAD_IN_SECONDS)
    assert reason.startswith("first hook section")


def test_chorus_wins_over_an_earlier_hook(tmp_path):
    d = tmp_path / "Song"
    _chart(d, "arr_lead_RS2.xml", [("hook", 20.0), ("chorus", 60.0)])
    start, _reason = backfill.loose_chorus_start(d)
    assert start == pytest.approx(60.0 - backfill.CHORUS_LEAD_IN_SECONDS)


def test_no_chorus_or_hook_gives_none(tmp_path):
    d = tmp_path / "Song"
    _chart(d, "arr_lead_RS2.xml", [("verse", 10.0), ("solo", 60.0)])
    assert backfill.loose_chorus_start(d) is None


def test_no_chart_gives_none(tmp_path):
    d = tmp_path / "Song"
    d.mkdir()
    assert backfill.loose_chorus_start(d) is None


def test_lead_in_never_goes_below_zero(tmp_path):
    d = tmp_path / "Song"
    _chart(d, "arr_lead_RS2.xml", [("chorus", 0.4)])
    start, _reason = backfill.loose_chorus_start(d)
    assert start == 0.0


def test_skips_a_bad_chart_and_one_with_no_sections(tmp_path):
    d = tmp_path / "Song"
    d.mkdir()
    (d / "arr_bass_RS2.xml").write_text("<song><sections", encoding="utf-8")
    _chart(d, "arr_combo_RS2.xml", [])
    _chart(d, "arr_lead_RS2.xml", [("chorus", 45.0)])
    start, _reason = backfill.loose_chorus_start(d)
    assert start == pytest.approx(45.0 - backfill.CHORUS_LEAD_IN_SECONDS)


def test_earliest_chorus_of_all_charts(tmp_path):
    # Kryptonite: bass 80.222, combo1 78.994, combo2 79.608.
    d = tmp_path / "Song"
    _chart(d, "arr_bass_RS2.xml", [("chorus", 80.222)])
    _chart(d, "arr_combo1_RS2.xml", [("chorus", 78.994)])
    _chart(d, "arr_combo2_RS2.xml", [("chorus", 79.608)])
    start, reason = backfill.loose_chorus_start(d)
    assert start == pytest.approx(78.994 - backfill.CHORUS_LEAD_IN_SECONDS)
    assert reason == "first chorus section at 79.0s"


def test_skips_vocals_and_showlights(tmp_path):
    d = tmp_path / "Song"
    _chart(d, "arr_vocals_RS2.xml", [("chorus", 10.0)])
    _chart(d, "arr_showlights_RS2.xml", [("chorus", 10.0)])
    assert backfill.loose_chorus_start(d) is None


def test_stops_reading_at_levels(tmp_path):
    d = tmp_path / "Song"
    _chart(d, "arr_lead_RS2.xml", [("verse", 10.0)], after_levels=[("chorus", 30.0)])
    assert backfill.loose_chorus_start(d) is None


@pytest.fixture
def render(monkeypatch):
    """Stub the ffmpeg calls. Returns the list of clip starts."""
    starts = []
    monkeypatch.setattr(backfill, "_probe_duration_seconds", lambda *_a: 200.0)
    monkeypatch.setattr(backfill, "_loudness_detect_start", lambda *_a: 120.0)

    def fake_render(_path, start, _ffmpeg, _tmp):
        starts.append(start)
        return b"ogg"

    monkeypatch.setattr(backfill, "_render_preview_clip", fake_render)
    return starts


def test_start_hint_is_used(tmp_path, render):
    data, reason = backfill.build_preview_from_audio_file(
        tmp_path / "a.wav", "ffmpeg", tmp_path,
        start_hint=(49.0, "first chorus section at 50.0s"),
    )
    assert data == b"ogg"
    assert render == [49.0]
    assert reason == "first chorus section at 50.0s"


def test_start_hint_near_the_end_is_clamped(tmp_path, render):
    backfill.build_preview_from_audio_file(
        tmp_path / "a.wav", "ffmpeg", tmp_path, start_hint=(190.0, "late chorus"),
    )
    assert render == [200.0 - backfill.FALLBACK_PREVIEW_DURATION - 1.0]


@pytest.mark.parametrize("hint", [None, (250.0, "past the end")])
def test_no_usable_hint_uses_loudness(tmp_path, render, hint):
    _data, reason = backfill.build_preview_from_audio_file(
        tmp_path / "a.wav", "ffmpeg", tmp_path, start_hint=hint,
    )
    assert render == [120.0]
    assert reason.startswith("loudness-detected")
