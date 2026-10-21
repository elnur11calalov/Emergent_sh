# Azərbaycan dilində 5 hərfli sözlər lüğəti
# Statik lüğət bazası: /app/backend/five_letter_words.txt
# Bu fayl yalnız referens üçündür və dəyişdirilməməlidir.

from pathlib import Path

_DICT_PATH = Path(__file__).parent / "five_letter_words.txt"


def _load_words():
    """Lüğəti fayldan oxuyur (yalnız bir dəfə import zamanı)."""
    words = []
    seen = set()
    with open(_DICT_PATH, "r", encoding="utf-8") as f:
        for line in f:
            w = line.strip().upper()
            if len(w) == 5 and w not in seen:
                seen.add(w)
                words.append(w)
    return words


AZERBAIJANI_WORDS = _load_words()
DAILY_WORDS = AZERBAIJANI_WORDS


def get_random_word():
    """Təsadüfi 5 hərfli söz qaytarır"""
    import random
    return random.choice(AZERBAIJANI_WORDS)


def get_daily_word():
    """Günlük söz qaytarır - hər gün üçün unikal (UTC)"""
    from datetime import datetime, timezone
    today = datetime.now(timezone.utc).date()
    day_index = today.toordinal() % len(DAILY_WORDS)
    return DAILY_WORDS[day_index]


def validate_word(word: str) -> bool:
    """Sözün lüğətdə olub olmadığını yoxlayır (hərflərin böyük/kiçikliyi nəzərə alınmır)"""
    return word.upper() in AZERBAIJANI_WORDS
