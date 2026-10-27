"""Extended account tests: auth cookie/bearer, logout, nickname gating, cumulative points, chat, solo, rooms."""
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

from conftest import make_user, mongo, _created_ids

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from azerbaijani_words import get_daily_word  # noqa: E402

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/") + "/api"
H = "Elnur"


def _nick():
    return f"TEST_{uuid.uuid4().hex[:6]}"


def _token(h):
    return h["Authorization"][7:]


def _random_word():
    return requests.get(f"{BASE_URL}/words/random?count=1").json()["words"][0]


def _new_room(hh):
    r = requests.post(f"{BASE_URL}/rooms/create", json={"room_name": "TEST_room", "host_code": H}, headers=hh)
    assert r.status_code == 200
    return r.json()["room_code"]


def _start(code, word):
    assert requests.post(f"{BASE_URL}/rooms/{code}/set-word", params={"word": word, "host_code": H}).status_code == 200
    assert requests.post(f"{BASE_URL}/rooms/{code}/start-game", params={"host_code": H}).status_code == 200


# --- Auth: cookie + bearer, logout, invalid session, expired session
def test_auth_me_cookie_and_bearer_and_logout():
    uid, h = make_user(_nick())
    tok = _token(h)
    assert requests.get(f"{BASE_URL}/auth/me", headers=h).json()["user_id"] == uid
    s = requests.Session()
    s.cookies.set("session_token", tok)
    r = s.get(f"{BASE_URL}/auth/me")
    assert r.status_code == 200 and r.json()["user_id"] == uid
    assert "_id" not in r.json()
    lo = s.post(f"{BASE_URL}/auth/logout")
    assert lo.status_code == 200
    assert "session_token" in lo.headers.get("set-cookie", "")
    assert requests.get(f"{BASE_URL}/auth/me", headers=h).status_code == 401


def test_invalid_session_id_401():
    r = requests.post(f"{BASE_URL}/auth/session", json={"session_id": "bogus-" + uuid.uuid4().hex})
    assert r.status_code == 401


def test_expired_session_401():
    uid, h = make_user(_nick())
    mongo.user_sessions.update_one({"session_token": _token(h)},
                                   {"$set": {"expires_at": datetime.now(timezone.utc) - timedelta(hours=1)}})
    assert requests.get(f"{BASE_URL}/auth/me", headers=h).status_code == 401


# --- Nickname gating on daily/room/chat endpoints + validation
def test_no_nickname_gets_403_everywhere():
    _, h = make_user()
    calls = [
        ("post", "/daily/guess", {"guess": "SALAM"}),
        ("get", "/daily/status", None),
        ("post", "/rooms/create", {"room_name": "x", "host_code": H}),
        ("post", "/rooms/ABCDEF/join", {"room_code": "ABCDEF"}),
        ("post", "/chat/send", {"room_code": "ABCDEF", "message": "hi"}),
    ]
    for m, p, body in calls:
        r = getattr(requests, m)(f"{BASE_URL}{p}", json=body, headers=h)
        assert r.status_code == 403, p
        assert r.json()["detail"] == "Əvvəlcə ləqəb seçin"
    # /auth/me and /profile/me still work without nickname
    assert requests.get(f"{BASE_URL}/auth/me", headers=h).json()["nickname"] is None


def test_nickname_validation_edges():
    _, h = make_user()
    assert requests.put(f"{BASE_URL}/auth/nickname", json={"nickname": "a" * 21}, headers=h).status_code == 400
    assert requests.put(f"{BASE_URL}/auth/nickname", json={"nickname": "  "}, headers=h).status_code == 400
    assert requests.put(f"{BASE_URL}/auth/nickname", json={"nickname": "<b>x</b>"}, headers=h).status_code == 400
    n = "TEST_Şəhla" + uuid.uuid4().hex[:3]
    r = requests.put(f"{BASE_URL}/auth/nickname", json={"nickname": f"  {n}  "}, headers=h)
    assert r.status_code == 200 and r.json()["nickname"] == n
    # re-saving own nickname with different case is allowed
    assert requests.put(f"{BASE_URL}/auth/nickname", json={"nickname": n.upper()}, headers=h).status_code == 200
    _, h2 = make_user()
    assert requests.put(f"{BASE_URL}/auth/nickname", json={"nickname": n.lower()}, headers=h2).status_code == 409


# --- Cumulative: daily + 2 room rounds, never reset; daily replay no double award
def test_daily_plus_two_rooms_accumulate():
    host_id, hh = make_user(_nick())
    pid, ph = make_user(_nick())
    w = get_daily_word()
    r = requests.post(f"{BASE_URL}/daily/guess", json={"guess": w}, headers=ph).json()
    assert r["points"] == 5000
    again = requests.post(f"{BASE_URL}/daily/guess", json={"guess": w}, headers=ph)
    assert again.status_code == 400
    me = requests.get(f"{BASE_URL}/auth/me", headers=ph).json()
    assert me["total_points"] == 5000 and me["daily_points"] == 5000

    code = _new_room(hh)
    requests.post(f"{BASE_URL}/rooms/{code}/join", json={"room_code": code}, headers=ph)
    # join twice is idempotent
    requests.post(f"{BASE_URL}/rooms/{code}/join", json={"room_code": code}, headers=ph)
    assert len(requests.get(f"{BASE_URL}/rooms/{code}/players").json()) == 1

    # round 1: win on 2nd try (1800)
    word = _random_word()
    _start(code, word)
    wrong = next(x for x in requests.get(f"{BASE_URL}/words/random?count=10").json()["words"] if x != word)
    requests.post(f"{BASE_URL}/rooms/{code}/guess", json={"room_code": code, "guess": wrong}, headers=ph)
    r1 = requests.post(f"{BASE_URL}/rooms/{code}/guess", json={"room_code": code, "guess": word}, headers=ph).json()
    assert r1["won"] and r1["points_earned"] == 1800
    requests.post(f"{BASE_URL}/rooms/{code}/end-round", params={"host_code": H})
    # round 2: win on 1st try (2500)
    word2 = _random_word()
    _start(code, word2)
    r2 = requests.post(f"{BASE_URL}/rooms/{code}/guess", json={"room_code": code, "guess": word2}, headers=ph).json()
    assert r2["points_earned"] == 2500 and r2["total_points"] == 4300

    me = requests.get(f"{BASE_URL}/auth/me", headers=ph).json()
    assert me["total_points"] == 9300 and me["daily_points"] == 5000 and me["room_points"] == 4300
    board = requests.get(f"{BASE_URL}/leaderboard/overall").json()
    mine = next(u for u in board if u["user_id"] == pid)
    assert mine["daily_points"] == 5000 and mine["room_points"] == 4300
    prof = requests.get(f"{BASE_URL}/profile/me", headers=ph).json()
    assert prof["daily"] == {"played": 1, "won": 1} and prof["room"] == {"played": 2, "won": 2}
    assert prof["distribution"]["1"] == 2 and prof["distribution"]["2"] == 1
    assert prof["rank"] >= 1 and len(prof["recent"]) == 3
    # host does not get a player row
    assert requests.post(f"{BASE_URL}/rooms/{code}/join", json={"room_code": code}, headers=hh).json()["message"] == "Siz bu odanın hostusunuz"
    requests.post(f"{BASE_URL}/rooms/{code}/close", params={"host_code": H})
    assert requests.post(f"{BASE_URL}/rooms/{code}/join", json={"room_code": code}, headers=ph).status_code == 410


# --- Chat uses nickname + sender_user_id
def test_chat_sender_fields():
    uid, h = make_user(_nick())
    _, hh = make_user(_nick())
    code = _new_room(hh)
    nick = requests.get(f"{BASE_URL}/auth/me", headers=h).json()["nickname"]
    assert requests.post(f"{BASE_URL}/chat/send", json={"room_code": code, "message": "salam"}, headers=h).status_code == 200
    msgs = requests.get(f"{BASE_URL}/chat/{code}").json()
    assert msgs[-1]["sender"] == nick and msgs[-1]["sender_user_id"] == uid
    assert requests.post(f"{BASE_URL}/chat/send", json={"room_code": code, "message": "   "}, headers=h).status_code == 400
    mongo.chat_messages.delete_many({"room_code": code})
    requests.post(f"{BASE_URL}/rooms/{code}/close", params={"host_code": H})


# --- Solo points do not count to account
def test_solo_points_not_counted():
    _, h = make_user(_nick())
    g = requests.post(f"{BASE_URL}/solo/start", json={}, headers=h).json()
    word = mongo.solo_games.find_one({"game_id": g["game_id"]})["word"]
    r = requests.post(f"{BASE_URL}/solo/guess", json={"game_id": g["game_id"], "guess": word}, headers=h).json()
    assert r["won"] and r["points"] == 2500
    me = requests.get(f"{BASE_URL}/auth/me", headers=h).json()
    assert me["total_points"] == 0
    prof = requests.get(f"{BASE_URL}/profile/me", headers=h).json()
    assert prof["solo"] == {"played": 1, "won": 1}


# --- Dictionary validation regression
def test_dictionary_validation_on_daily():
    _, h = make_user(_nick())
    r = requests.post(f"{BASE_URL}/daily/guess", json={"guess": "QQQQQ"}, headers=h)
    assert r.status_code == 400 and r.json()["detail"] == "Bu söz lüğətdə yoxdur"
    assert requests.get(f"{BASE_URL}/daily/status", headers=h).json()["attempts"] == []


# --- Rush mode ends round on first win
def test_rush_mode():
    _, hh = make_user(_nick())
    _, ph = make_user(_nick())
    code = _new_room(hh)
    requests.post(f"{BASE_URL}/rooms/{code}/join", json={"room_code": code}, headers=ph)
    requests.post(f"{BASE_URL}/rooms/{code}/settings", params={"host_code": H}, json={"game_mode": "rush"})
    w = _random_word()
    _start(code, w)
    requests.post(f"{BASE_URL}/rooms/{code}/guess", json={"room_code": code, "guess": w}, headers=ph)
    assert requests.get(f"{BASE_URL}/rooms/{code}").json()["game_active"] is False
    requests.post(f"{BASE_URL}/rooms/{code}/close", params={"host_code": H})


# --- Security observation: room GET exposes the secret word to players
def test_room_get_does_not_leak_word():
    _, hh = make_user(_nick())
    code = _new_room(hh)
    w = _random_word()
    _start(code, w)
    room = requests.get(f"{BASE_URL}/rooms/{code}").json()
    requests.post(f"{BASE_URL}/rooms/{code}/close", params={"host_code": H})
    assert room.get("current_word") != w, "current_word is publicly visible via GET /api/rooms/{code}"
