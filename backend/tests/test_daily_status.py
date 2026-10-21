# Daily mode: GET /api/daily/status + resume/replay-block semantics
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")


@pytest.fixture
def s():
    return requests.Session()


def test_status_new_player_empty(s):
    name = f"TEST_status_new_{int(time.time()*1000)}"
    r = s.get(f"{BASE_URL}/api/daily/status", params={"player_name": name})
    assert r.status_code == 200
    d = r.json()
    assert d == {"attempts": [], "completed": False, "won": False, "points": 0, "correct_word": None}


def test_status_missing_param(s):
    r = s.get(f"{BASE_URL}/api/daily/status")
    assert r.status_code == 422


def test_status_after_guesses_and_completion(s):
    name = f"TEST_status_play_{int(time.time()*1000)}"
    # dictionary words only (non-dictionary guesses are now rejected with 400)
    words = s.get(f"{BASE_URL}/api/words/random", params={"count": 10}).json()["words"]
    for g in words[:2]:
        r = s.post(f"{BASE_URL}/api/daily/guess", json={"player_name": name, "guess": g})
        assert r.status_code == 200
        if r.json()["won"]:
            pytest.skip("Random word happened to be the daily word")
    d = s.get(f"{BASE_URL}/api/daily/status", params={"player_name": name}).json()
    assert len(d["attempts"]) == 2
    assert d["attempts"][0]["guess"] == words[0]
    assert len(d["attempts"][0]["result"]) == 5
    assert d["completed"] is False
    assert d["correct_word"] is None
    assert "_id" not in d
    # finish (4 more wrong guesses)
    last = None
    for g in words[2:6]:
        last = s.post(f"{BASE_URL}/api/daily/guess", json={"player_name": name, "guess": g})
        assert last.status_code == 200
        if last.json()["won"]:
            pytest.skip("Random word happened to be the daily word")
    ld = last.json()
    d = s.get(f"{BASE_URL}/api/daily/status", params={"player_name": name}).json()
    assert d["completed"] is True
    assert len(d["attempts"]) == 6
    assert d["won"] == ld["won"]
    assert isinstance(d["correct_word"], str) and len(d["correct_word"]) == 5
    # replay blocked
    r = s.post(f"{BASE_URL}/api/daily/guess", json={"player_name": name, "guess": words[0]})
    assert r.status_code == 400
