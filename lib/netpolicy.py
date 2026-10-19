"""Global network switch (personal build).

FEEDBACK_OFFLINE=1 (or true/yes/on) blocks these outbound calls: MusicBrainz /
Cover Art Archive / AcoustID enrichment, the art-from-URL fetch and the artist
links, the achievements wall, career venue-pack downloads, plugin git
fetch/pull, plugin pip installs, the npx Tailwind fetch, the remote WhisperX /
CREPE helpers, and (through window.FEEDBACK_OFFLINE in the served index.html)
Google Fonts, CDN fallbacks and the WebAudioFont drum kit. A local WhisperX
model download from Hugging Face does not check this switch. Set
HF_HUB_OFFLINE=1 for it.

Unset or any other value: the app uses the network, exactly as upstream.

Flat-importable, no import-time IO (constitution P-V).
"""

from env_compat import env_flag_compat

OFFLINE_MESSAGE = "Offline mode: networking is off (FEEDBACK_OFFLINE is set)."


def network_allowed() -> bool:
    """True unless the user turned on FEEDBACK_OFFLINE."""
    return not env_flag_compat("FEEDBACK_OFFLINE")
