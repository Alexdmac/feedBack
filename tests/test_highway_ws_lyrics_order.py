"""Lyrics source order for loose folders and archives (ws_highway).

Rocksmith packs of Japanese songs carry a romaji `vocals` part and a
Japanese-script `jvocals` part with the same timing. The romaji part must win.
"""

from pathlib import Path

from routers.ws_highway import _lyrics_xml_order


def test_romaji_vocals_win_over_jvocals():
    paths = [
        Path("song/arr_vocals_RS2.xml"),
        Path("song/arr_lead_RS2.xml"),
        Path("song/arr_jvocals_RS2.xml"),
        Path("song/arr_bass_RS2.xml"),
    ]
    order = [p.name for p in _lyrics_xml_order(paths)]
    assert order == [
        "arr_bass_RS2.xml",
        "arr_lead_RS2.xml",
        "arr_vocals_RS2.xml",
        "arr_jvocals_RS2.xml",
    ]


def test_jvocals_only_song_keeps_its_lyrics_source():
    paths = [Path("song/arr_lead_RS2.xml"), Path("song/arr_JVocals_RS2.xml")]
    assert [p.name for p in _lyrics_xml_order(paths)] == ["arr_lead_RS2.xml", "arr_JVocals_RS2.xml"]


def test_accepts_a_generator_like_the_glob_walkers():
    gen = (Path(n) for n in ("b.xml", "a.xml"))
    assert [p.name for p in _lyrics_xml_order(gen)] == ["a.xml", "b.xml"]
