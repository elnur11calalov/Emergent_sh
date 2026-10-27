"""Account, nickname, cumulative points and protected-endpoint tests."""
import os
import sys
import uuid
from pathlib import Path

import requests

from conftest import make_user, mongo

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from azerbaijani_words import get_daily_word  # noqa: E402

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/") + "/api"


def test_protected_endpoints_need_login():
    assert requests.get(f"{BASE_URL}/auth/me").status_code == 401
    assert requests.post(f"{BASE_URL}/daily/guess", json={"guess": "SALAM"}).status_code == 401
    assert requests.post(f"{BASE_URL}/rooms/create", json={"room_name": "x", "host_code": "Elnur"}).status_code == 401
    # Guests may still play solo
    assert requests.post(f"{BASE_URL}/solo/start", json={"player_name": "Qonaq"}).status_code == 200


def test_nickname_required_then_unique():
    _, h = make_user()
    assert requests.get(f"{BASE_URL}/daily/status", headers=h).status_code == 403
    nick = f"TEST_{uuid.uuid4().hex[:6]}"
    r = requests.put(f"{BASE_URL}/auth/nickname", json={"nickname": nick}, headers=h)
    assert r.status_code == 200 and r.json()["nickname"] == nick
    _, h2 = make_user()
    assert requests.put(f"{BASE_URL}/auth/nickname", json={"nickname": nick.lower()}, headers=h2).status_code == 409
    assert requests.put(f"{BASE_URL}/auth/nickname", json={"nickname": "x"}, headers=h2).status_code == 400


def test_daily_points_doubled_and_added_to_account():
    uid, h = make_user(f"TEST_{uuid.uuid4().hex[:6]}")
    word = get_daily_word()
    r = requests.post(f"{BASE_URL}/daily/guess", json={"guess": word.lower()}, headers=h).json()
    assert r["won"] and r["points"] == 5000
    me = requests.get(f"{BASE_URL}/auth/me", headers=h).json()
    assert me["daily_points"] == 5000 and me["total_points"] == 5000
    status = requests.get(f"{BASE_URL}/daily/status", headers=h).json()
    assert status["completed"] and status["points"] == 5000


def test_room_points_accumulate_and_overall_leaderboard():
    host_id, hh = make_user(f"TEST_H{uuid.uuid4().hex[:5]}")
    pid, ph = make_user(f"TEST_P{uuid.uuid4().hex[:5]}")
    mongo.users.update_one({"user_id": pid}, {"$set": {"total_points": 1000, "room_points": 1000}})
    code = requests.post(f"{BASE_URL}/rooms/create", json={"room_name": "TEST_room", "host_code": "Elnur"}, headers=hh).json()["room_code"]
    assert requests.post(f"{BASE_URL}/rooms/{code}/join", json={"room_code": code}, headers=ph).status_code == 200
    word = requests.get(f"{BASE_URL}/words/random?count=1").json()["words"][0]
    requests.post(f"{BASE_URL}/rooms/{code}/set-word", params={"word": word, "host_code": "Elnur"})
    requests.post(f"{BASE_URL}/rooms/{code}/start-game", params={"host_code": "Elnur"})
    r = requests.post(f"{BASE_URL}/rooms/{code}/guess", json={"room_code": code, "guess": word}, headers=ph).json()
    assert r["won"] and r["points_earned"] == 2500
    me = requests.get(f"{BASE_URL}/auth/me", headers=ph).json()
    assert me["room_points"] == 3500 and me["total_points"] == 3500  # added on top, never reset

    board = requests.get(f"{BASE_URL}/leaderboard/overall").json()
    mine = next(u for u in board if u["user_id"] == pid)
    assert mine["total_points"] == 3500
    totals = [u["total_points"] for u in board]
    assert totals == sorted(totals, reverse=True)

    profile = requests.get(f"{BASE_URL}/profile/me", headers=ph).json()
    assert profile["room"] == {"played": 1, "won": 1}
    assert profile["distribution"]["1"] == 1 and profile["recent"][0]["mode"] == "room"

    room = requests.get(f"{BASE_URL}/rooms/{code}").json()
    assert room["host_user_id"] == host_id
    requests.post(f"{BASE_URL}/rooms/{code}/close", params={"host_code": "Elnur"})


def test_host_panel_needs_login_and_code():
    _, h = make_user(f"TEST_{uuid.uuid4().hex[:6]}")
    assert requests.get(f"{BASE_URL}/host/active-rooms", params={"host_code": "Elnur"}).status_code == 401
    assert requests.get(f"{BASE_URL}/host/active-rooms", params={"host_code": "bad"}, headers=h).status_code == 403
    assert requests.get(f"{BASE_URL}/host/active-rooms", params={"host_code": "Elnur"}, headers=h).status_code == 200


def test_signed_in_solo_resumes():
    _, h = make_user(f"TEST_{uuid.uuid4().hex[:6]}")
    g = requests.post(f"{BASE_URL}/solo/start", json={}, headers=h).json()
    word = requests.get(f"{BASE_URL}/words/random?count=1").json()["words"][0]
    requests.post(f"{BASE_URL}/solo/guess", json={"game_id": g["game_id"], "guess": word}, headers=h)
    again = requests.post(f"{BASE_URL}/solo/start", json={}, headers=h).json()
    if again["game_id"] == g["game_id"]:
        assert len(again["attempts"]) == 1
