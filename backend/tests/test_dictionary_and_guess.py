# Static dictionary (five_letter_words.md) + guess validation across solo/daily/rooms
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
HOST = "Elnur"
NOT_IN_DICT = "Bu söz lüğətdə yoxdur"
WRONG_LEN = "Söz 5 hərfli olmalıdır!"


def az_lower(w):
    return w.replace("İ", "i").replace("I", "ı").lower()


def mixed(w):
    low = az_lower(w)
    return "".join(c if i % 2 else low[i] for i, c in enumerate(w))


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def words(s):
    r = s.get(f"{BASE_URL}/api/words/random", params={"count": 10})
    assert r.status_code == 200
    return r.json()["words"]


# ---- words endpoints ----
def test_random_words(s):
    r = s.get(f"{BASE_URL}/api/words/random", params={"count": 5})
    assert r.status_code == 200
    w = r.json()["words"]
    assert len(w) == 5
    assert all(isinstance(x, str) and len(x) == 5 for x in w)


def test_validate_abide_lower(s):
    d = s.post(f"{BASE_URL}/api/words/validate", params={"word": "abidə"}).json()
    assert d == {"valid": True, "word": "ABİDƏ"}


def test_validate_abide_mixed(s):
    d = s.post(f"{BASE_URL}/api/words/validate", params={"word": "AbİdƏ"}).json()
    assert d["valid"] is True and d["word"] == "ABİDƏ"


def test_validate_invalid(s):
    d = s.post(f"{BASE_URL}/api/words/validate", params={"word": "XXXXX"}).json()
    assert d["valid"] is False


def test_validate_random_words_lowercase(s, words):
    for w in words:
        d = s.post(f"{BASE_URL}/api/words/validate", params={"word": az_lower(w)}).json()
        assert d["valid"] is True, "random word lowercase should validate"
        assert d["word"] == w


# ---- solo ----
def _solo(s):
    r = s.post(f"{BASE_URL}/api/solo/start", json={"player_name": f"TEST_solo_{time.time()}"})
    assert r.status_code == 200
    return r.json()["game_id"]


def test_solo_invalid_word_no_attempt(s, words):
    gid = _solo(s)
    r = s.post(f"{BASE_URL}/api/solo/guess", json={"game_id": gid, "player_name": "x", "guess": "QQQQQ"})
    assert r.status_code == 400 and r.json()["detail"] == NOT_IN_DICT
    r = s.post(f"{BASE_URL}/api/solo/guess", json={"game_id": gid, "player_name": "x", "guess": "abcd"})
    assert r.status_code == 400 and r.json()["detail"] == WRONG_LEN
    r = s.post(f"{BASE_URL}/api/solo/guess", json={"game_id": gid, "player_name": "x", "guess": az_lower(words[0])})
    assert r.status_code == 200
    assert r.json()["attempts_count"] == 1  # invalid guesses didn't use attempts


# ---- daily ----
def test_daily_invalid_word_no_attempt(s, words):
    name = f"TEST_daily_dict_{time.time()}"
    r = s.post(f"{BASE_URL}/api/daily/guess", json={"player_name": name, "guess": "ZZZZZ"})
    assert r.status_code == 400 and r.json()["detail"] == NOT_IN_DICT
    st = s.get(f"{BASE_URL}/api/daily/status", params={"player_name": name}).json()
    assert st["attempts"] == []
    r = s.post(f"{BASE_URL}/api/daily/guess", json={"player_name": name, "guess": mixed(words[1])})
    assert r.status_code == 200
    st = s.get(f"{BASE_URL}/api/daily/status", params={"player_name": name}).json()
    assert len(st["attempts"]) == 1
    assert st["attempts"][0]["guess"] == words[1]  # stored uppercase (az rules)


# ---- rooms ----
@pytest.fixture(scope="module")
def room(s):
    r = s.post(f"{BASE_URL}/api/rooms/create", json={"host_name": "TEST_host", "room_name": "TEST_dict_room", "host_code": HOST})
    assert r.status_code == 200
    code = r.json()["room_code"]
    for p in ["TEST_P1", "TEST_P2"]:
        assert s.post(f"{BASE_URL}/api/rooms/{code}/join", json={"room_code": code, "player_name": p}).status_code == 200
    yield code
    s.post(f"{BASE_URL}/api/rooms/{code}/close", params={"host_code": HOST})


def test_set_word_invalid(s, room):
    r = s.post(f"{BASE_URL}/api/rooms/{room}/set-word", params={"word": "QQQQQ", "host_code": HOST})
    assert r.status_code == 400 and r.json()["detail"] == NOT_IN_DICT
    r = s.post(f"{BASE_URL}/api/rooms/{room}/set-word", params={"word": "abc", "host_code": HOST})
    assert r.status_code == 400 and r.json()["detail"] == WRONG_LEN


def test_room_lowercase_word_win(s, room, words):
    target = words[2]
    r = s.post(f"{BASE_URL}/api/rooms/{room}/set-word", params={"word": az_lower(target), "host_code": HOST})
    assert r.status_code == 200
    assert s.get(f"{BASE_URL}/api/rooms/{room}").json()["current_word"] == target
    assert s.post(f"{BASE_URL}/api/rooms/{room}/start-game", params={"host_code": HOST}).status_code == 200
    # invalid guess doesn't consume attempt
    r = s.post(f"{BASE_URL}/api/rooms/{room}/guess", json={"room_code": room, "player_name": "TEST_P1", "guess": "QQQQQ"})
    assert r.status_code == 400 and r.json()["detail"] == NOT_IN_DICT
    r = s.post(f"{BASE_URL}/api/rooms/{room}/guess", json={"room_code": room, "player_name": "TEST_P1", "guess": az_lower(target)})
    assert r.status_code == 200
    d = r.json()
    assert d["won"] is True and d["points_earned"] == 2500
    # mixed case for P2
    r = s.post(f"{BASE_URL}/api/rooms/{room}/guess", json={"room_code": room, "player_name": "TEST_P2", "guess": mixed(target)})
    assert r.status_code == 200 and r.json()["won"] is True and r.json()["points_earned"] == 2500
    players = s.get(f"{BASE_URL}/api/rooms/{room}/players").json()
    p1 = next(p for p in players if p["player_name"] == "TEST_P1")
    assert len(p1["current_attempts"]) == 1
    assert p1["current_attempts"][0]["guess"] == target
