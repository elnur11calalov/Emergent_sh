# Statik lüğət bazası: /app/backend/five_letter_words.md (dəyişməz, yalnız referens)
# Yüklənmə bir dəfə, modul import olunanda baş verir.
import random
from datetime import datetime, timezone
from pathlib import Path

_DICT_PATH = Path(__file__).parent / "five_letter_words.md"


def az_upper(word: str) -> str:
    """Azərbaycan dilinə uyğun böyük hərf: i -> İ, ı -> I (kiril Х/х -> latın X)"""
    w = word.strip().replace("Х", "X").replace("х", "x")
    return w.replace("i", "İ").replace("ı", "I").upper()


def _load_words():
    words = []
    seen = set()
    with open(_DICT_PATH, encoding="utf-8") as f:
        for line in f:
            w = az_upper(line)
            if not w or w.startswith("`") or len(w) != 5 or w in seen:
                continue
            seen.add(w)
            words.append(w)
    return words


AZERBAIJANI_WORDS = _load_words()
_WORD_SET = frozenset(AZERBAIJANI_WORDS)
DAILY_WORDS = AZERBAIJANI_WORDS


def get_random_word():
    return random.choice(AZERBAIJANI_WORDS)


def get_daily_word():
    """Hər gün (UTC) üçün eyni söz"""
    today = datetime.now(timezone.utc).date()
    return DAILY_WORDS[today.toordinal() % len(DAILY_WORDS)]


def validate_word(word: str) -> bool:
    """Böyük/kiçik hərfdən asılı olmayaraq lüğətdə yoxlayır"""
    return az_upper(word) in _WORD_SET
