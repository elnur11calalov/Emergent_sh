"""Security fix regression: room word visibility, host-only endpoints, chat membership, solo ownership, daily word secrecy."""
import os
import sys
import uuid
from pathlib import Path

import pytest
import requests

from conftest import make_user, mongo

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from azerbaijani_words import get_daily_word  # noqa: E402

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/") + "/api"
H = "Elnur"


def _nick():
    return f"TEST_{uuid.uuid4().hex[:6]}"


def _words(n=5):
    return requests.get(f"{BASE_URL}/words/random", params={"count": n}).json()["words"]


@pytest.fixture(scope="module")
def setup():
    host_id, hh = make_user(_nick())
    pid, ph = make_user(_nick())
    oid, oh = make_user(_nick())  # outsider (logged in, not joined)
    code = requests.post(f"{BASE_URL}/rooms/create", json={"room_name": "TEST_sec", "host_code": H}, headers=hh).json()["room_code"]
    assert requests.post(f"{BASE_URL}/rooms/{code}/join", json={"room_code": code}, headers=ph).status_code == 200
    word = _words(1)[0]
    assert requests.post(f"{BASE_URL}/rooms/{code}/set-word", params={"word": word, "host_code": H}, headers=hh).status_code == 200
    yield {"code": code, "word": word, "hh": hh, "ph": ph, "oh": oh, "host_id": host_id}
    requests.post(f"{BASE_URL}/rooms/{code}/close", params={"host_code": H}, headers=hh)
    mongo.chat_messages.delete_many({"room_code": code})


# --- GET /rooms/{code} word visibility
def test_room_get_anonymous_no_word(setup):
    r = requests.get(f"{BASE_URL}/rooms/{setup['code']}")
    assert r.status_code == 200
    d = r.json()
    assert "current_word" not in d and "host_code" not in d and "_id" not in d
    assert d["room_code"] == setup["code"]


def test_room_get_player_no_word(setup):
    d = requests.get(f"{BASE_URL}/rooms/{setup['code']}", headers=setup["ph"]).json()
    assert "current_word" not in d and "host_code" not in d


def test_room_get_host_sees_word(setup):
    d = requests.get(f"{BASE_URL}/rooms/{setup['code']}", headers=setup["hh"]).json()
    assert d["current_word"] == setup["word"]
    assert "host_code" not in d


def test_room_get_cookie_host_sees_word(setup):
    s = requests.Session()
    s.cookies.set("session_token", setup["hh"]["Authorization"][7:])
    assert s.get(f"{BASE_URL}/rooms/{setup['code']}").json()["current_word"] == setup["word"]


def test_room_get_404():
    assert requests.get(f"{BASE_URL}/rooms/NOPE00").status_code == 404


def test_host_panel_active_rooms_no_word_leak_to_host_panel(setup):
    # Host panel is gated by login + Elnur; report whether it exposes word/host_code
    rooms = requests.get(f"{BASE_URL}/host/active-rooms", params={"host_code": H}, headers=setup["ph"]).json()
    mine = next(r for r in rooms if r["room_code"] == setup["code"])
    print("active-rooms keys:", sorted(mine.keys()))


# --- host-only endpoints
HOST_ENDPOINTS = [
    ("set-word", {"word": None}),
    ("start-game", {}),
    ("end-round", {}),
    ("close", {}),
]


@pytest.mark.parametrize("ep,extra", HOST_ENDPOINTS)
def test_host_endpoint_anonymous_401(setup, ep, extra):
    params = {"host_code": H, **({"word": setup["word"]} if "word" in extra else {})}
    r = requests.post(f"{BASE_URL}/rooms/{setup['code']}/{ep}", params=params)
    assert r.status_code == 401


@pytest.mark.parametrize("ep,extra", HOST_ENDPOINTS)
def test_host_endpoint_non_host_403(setup, ep, extra):
    params = {"host_code": H, **({"word": setup["word"]} if "word" in extra else {})}
    r = requests.post(f"{BASE_URL}/rooms/{setup['code']}/{ep}", params=params, headers=setup["ph"])
    assert r.status_code == 403
    assert r.json()["detail"] == "Yalnız odanın hostu bunu edə bilər!"


def test_settings_non_host_403_and_anon_401(setup):
    url = f"{BASE_URL}/rooms/{setup['code']}/settings"
    assert requests.post(url, params={"host_code": H}, json={"game_mode": "rush"}).status_code == 401
    assert requests.post(url, params={"host_code": H}, json={"game_mode": "rush"}, headers=setup["oh"]).status_code == 403
    room = requests.get(f"{BASE_URL}/rooms/{setup['code']}").json()
    assert room["settings"]["game_mode"] == "standard"


def test_host_wrong_code_403(setup):
    r = requests.post(f"{BASE_URL}/rooms/{setup['code']}/start-game", params={"host_code": "bad"}, headers=setup["hh"])
    assert r.status_code == 403 and r.json()["detail"] == "Yanlış host kodu!"


def test_room_state_unchanged_after_rejected_calls(setup):
    room = requests.get(f"{BASE_URL}/rooms/{setup['code']}", headers=setup["hh"]).json()
    assert room["status"] == "active" and room["game_active"] is False
    assert room["current_word"] == setup["word"] and room["round_number"] == 0


def test_host_full_round_then_word_still_hidden(setup):
    code, hh, ph = setup["code"], setup["hh"], setup["ph"]
    assert requests.post(f"{BASE_URL}/rooms/{code}/start-game", params={"host_code": H}, headers=hh).status_code == 200
    assert "current_word" not in requests.get(f"{BASE_URL}/rooms/{code}", headers=ph).json()
    r = requests.post(f"{BASE_URL}/rooms/{code}/guess", json={"room_code": code, "guess": setup["word"]}, headers=ph).json()
    assert r["won"] and r["points_earned"] == 2500
    # room guess response must not contain the word either
    assert setup["word"] not in str(r)
    assert requests.post(f"{BASE_URL}/rooms/{code}/end-round", params={"host_code": H}, headers=hh).status_code == 200


# --- chat membership
def test_chat_membership(setup):
    code = setup["code"]
    url = f"{BASE_URL}/chat/send"
    assert requests.post(url, json={"room_code": code, "message": "hi"}).status_code == 401
    r = requests.post(url, json={"room_code": code, "message": "hi"}, headers=setup["oh"])
    assert r.status_code == 403 and r.json()["detail"] == "Siz bu odada deyilsiniz"
    assert requests.post(url, json={"room_code": code, "message": "TEST host"}, headers=setup["hh"]).status_code == 200
    assert requests.post(url, json={"room_code": code, "message": "TEST player"}, headers=setup["ph"]).status_code == 200
    assert requests.post(url, json={"room_code": "NOPE00", "message": "x"}, headers=setup["ph"]).status_code == 404
    msgs = [m["message"] for m in requests.get(f"{BASE_URL}/chat/{code}").json()]
    assert "TEST host" in msgs and "TEST player" in msgs and "hi" not in msgs


# --- solo ownership
def test_solo_ownership():
    _, a = make_user(_nick())
    _, b = make_user(_nick())
    g = requests.post(f"{BASE_URL}/solo/start", json={}, headers=a).json()
    w = _words(1)[0]
    assert requests.post(f"{BASE_URL}/solo/guess", json={"game_id": g["game_id"], "guess": w}, headers=b).status_code == 403
    assert requests.post(f"{BASE_URL}/solo/guess", json={"game_id": g["game_id"], "guess": w}).status_code == 403
    r = requests.post(f"{BASE_URL}/solo/guess", json={"game_id": g["game_id"], "guess": w}, headers=a)
    assert r.status_code == 200 and r.json()["attempts_count"] == 1


def test_solo_guest_game_playable_and_no_word_before_end():
    g = requests.post(f"{BASE_URL}/solo/start", json={"player_name": "TEST_guest"}).json()
    word = mongo.solo_games.find_one({"game_id": g["game_id"]})["word"]
    wrong = next(x for x in _words(10) if x != word)
    r = requests.post(f"{BASE_URL}/solo/guess", json={"game_id": g["game_id"], "guess": wrong}).json()
    assert r["correct_word"] is None and r["completed"] is False
    r = requests.post(f"{BASE_URL}/solo/guess", json={"game_id": g["game_id"], "guess": word}).json()
    assert r["won"] and r["correct_word"] == word
    mongo.solo_games.delete_one({"game_id": g["game_id"]})


def test_solo_start_response_no_word():
    g = requests.post(f"{BASE_URL}/solo/start", json={"player_name": "TEST_guest"}).json()
    word = mongo.solo_games.find_one({"game_id": g["game_id"]})["word"]
    assert "word" not in g and word not in str(g)
    mongo.solo_games.delete_one({"game_id": g["game_id"]})


# --- daily secrecy
def test_daily_word_endpoint_no_word():
    d = requests.get(f"{BASE_URL}/daily/word").json()
    assert d["word_length"] == 5 and "word" not in d
    assert get_daily_word() not in str(d)


def test_daily_status_hidden_until_completed_then_revealed():
    uid, h = make_user(_nick())
    dw = get_daily_word()
    st = requests.get(f"{BASE_URL}/daily/status", headers=h).json()
    assert st["correct_word"] is None
    wrong = next(x for x in _words(10) if x != dw)
    r = requests.post(f"{BASE_URL}/daily/guess", json={"guess": wrong}, headers=h).json()
    assert r["completed"] is False and r["correct_word"] is None
    st = requests.get(f"{BASE_URL}/daily/status", headers=h).json()
    assert st["correct_word"] is None and len(st["attempts"]) == 1
    r = requests.post(f"{BASE_URL}/daily/guess", json={"guess": dw}, headers=h).json()
    assert r["won"] and r["points"] == 3600 and r["correct_word"] == dw  # 2nd try 1800 x2
    st = requests.get(f"{BASE_URL}/daily/status", headers=h).json()
    assert st["completed"] and st["correct_word"] == dw
    me = requests.get(f"{BASE_URL}/auth/me", headers=h).json()
    assert me["total_points"] == 3600 and me["daily_points"] == 3600


def test_daily_leaderboard_no_word_leak_from_unfinished():
    # leaderboard only returns completed games; check no in-progress attempts are exposed
    rows = requests.get(f"{BASE_URL}/daily/leaderboard").json()
    assert all(r["completed"] for r in rows)


# --- Other leak vectors (observations)
def test_daily_leaderboard_leaks_word_via_attempts():
    _, h = make_user(_nick())
    dw = get_daily_word()
    requests.post(f"{BASE_URL}/daily/guess", json={"guess": dw}, headers=h)
    rows = requests.get(f"{BASE_URL}/daily/leaderboard").json()
    leaked = any(a.get("guess") == dw for r in rows for a in r.get("attempts", []))
    assert not leaked, "GET /api/daily/leaderboard (public) returns winners' attempts incl. the daily word"


def test_room_players_leaks_word_via_attempts(setup):
    code, hh, ph = setup["code"], setup["hh"], setup["ph"]
    w = _words(1)[0]
    requests.post(f"{BASE_URL}/rooms/{code}/set-word", params={"word": w, "host_code": H}, headers=hh)
    requests.post(f"{BASE_URL}/rooms/{code}/start-game", params={"host_code": H}, headers=hh)
    requests.post(f"{BASE_URL}/rooms/{code}/guess", json={"room_code": code, "guess": w}, headers=ph)
    players = requests.get(f"{BASE_URL}/rooms/{code}/players").json()
    leaked = any(a.get("guess") == w for p in players for a in p.get("current_attempts", []))
    requests.post(f"{BASE_URL}/rooms/{code}/end-round", params={"host_code": H}, headers=hh)
    assert not leaked, "GET /api/rooms/{code}/players (public) exposes a winner's guesses during an active round"


def test_host_active_rooms_exposes_word_to_any_logged_in_user(setup):
    code, hh = setup["code"], setup["hh"]
    w = _words(1)[0]
    requests.post(f"{BASE_URL}/rooms/{code}/set-word", params={"word": w, "host_code": H}, headers=hh)
    rooms = requests.get(f"{BASE_URL}/host/active-rooms", params={"host_code": H}, headers=setup["oh"]).json()
    mine = next(r for r in rooms if r["room_code"] == code)
    assert mine.get("current_word") != w, "/api/host/active-rooms returns current_word to any user who knows 'Elnur' (frontend auto-sends it)"
