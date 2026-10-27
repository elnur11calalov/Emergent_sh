# Static dictionary (Bes_herfli_sozler.md) + guess validation across solo/daily/rooms
import os
import time
import uuid
import pytest
import requests

from conftest import make_user

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


# ---- daily (requires login) ----
def test_daily_invalid_word_no_attempt(s, words):
    _, h = make_user(f"TEST_{uuid.uuid4().hex[:6]}")
    r = s.post(f"{BASE_URL}/api/daily/guess", json={"guess": "ZZZZZ"}, headers=h)
    assert r.status_code == 400 and r.json()["detail"] == NOT_IN_DICT
    st = s.get(f"{BASE_URL}/api/daily/status", headers=h).json()
    assert st["attempts"] == []
    r = s.post(f"{BASE_URL}/api/daily/guess", json={"guess": mixed(words[1])}, headers=h)
    assert r.status_code == 200
    st = s.get(f"{BASE_URL}/api/daily/status", headers=h).json()
    assert len(st["attempts"]) == 1
    assert st["attempts"][0]["guess"] == words[1]  # stored uppercase (az rules)


# ---- rooms (requires login) ----
@pytest.fixture(scope="module")
def players():
    return [make_user(f"TEST_P{uuid.uuid4().hex[:5]}")[1] for _ in range(2)]


@pytest.fixture(scope="module")
def host():
    return make_user(f"TEST_H{uuid.uuid4().hex[:5]}")[1]


@pytest.fixture(scope="module")
def room(s, players, host):
    r = s.post(f"{BASE_URL}/api/rooms/create", json={"room_name": "TEST_dict_room", "host_code": HOST}, headers=host)
    assert r.status_code == 200
    code = r.json()["room_code"]
    for h in players:
        assert s.post(f"{BASE_URL}/api/rooms/{code}/join", json={"room_code": code}, headers=h).status_code == 200
    yield code
    s.post(f"{BASE_URL}/api/rooms/{code}/close", params={"host_code": HOST}, headers=host)


def test_set_word_invalid(s, room, host):
    r = s.post(f"{BASE_URL}/api/rooms/{room}/set-word", params={"word": "QQQQQ", "host_code": HOST}, headers=host)
    assert r.status_code == 400 and r.json()["detail"] == NOT_IN_DICT
    r = s.post(f"{BASE_URL}/api/rooms/{room}/set-word", params={"word": "abc", "host_code": HOST}, headers=host)
    assert r.status_code == 400 and r.json()["detail"] == WRONG_LEN


def test_room_lowercase_word_win(s, room, words, players, host):
    p1, p2 = players
    target = words[2]
    r = s.post(f"{BASE_URL}/api/rooms/{room}/set-word", params={"word": az_lower(target), "host_code": HOST}, headers=host)
    assert r.status_code == 200
    assert s.get(f"{BASE_URL}/api/rooms/{room}", headers=host).json()["current_word"] == target
    assert s.post(f"{BASE_URL}/api/rooms/{room}/start-game", params={"host_code": HOST}, headers=host).status_code == 200
    # invalid guess doesn't consume attempt
    r = s.post(f"{BASE_URL}/api/rooms/{room}/guess", json={"room_code": room, "guess": "QQQQQ"}, headers=p1)
    assert r.status_code == 400 and r.json()["detail"] == NOT_IN_DICT
    r = s.post(f"{BASE_URL}/api/rooms/{room}/guess", json={"room_code": room, "guess": az_lower(target)}, headers=p1)
    assert r.status_code == 200
    d = r.json()
    assert d["won"] is True and d["points_earned"] == 2500
    # mixed case for P2
    r = s.post(f"{BASE_URL}/api/rooms/{room}/guess", json={"room_code": room, "guess": mixed(target)}, headers=p2)
    assert r.status_code == 200 and r.json()["won"] is True and r.json()["points_earned"] == 2500
    me = s.get(f"{BASE_URL}/api/auth/me", headers=p1).json()
    p1_row = next(p for p in s.get(f"{BASE_URL}/api/rooms/{room}/players", headers=p1).json() if p["user_id"] == me["user_id"])
    assert len(p1_row["current_attempts"]) == 1
    assert p1_row["current_attempts"][0]["guess"] == target
