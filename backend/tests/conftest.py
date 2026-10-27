"""Shared test helpers: seeded Google-auth users (see /app/auth_testing.md)."""
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from dotenv import dotenv_values
from pymongo import MongoClient

ENV = dotenv_values(Path(__file__).resolve().parents[1] / ".env")
mongo = MongoClient(ENV["MONGO_URL"])[ENV["DB_NAME"]]
_created_ids = []  # per worker process, so parallel workers never delete each other's users


def make_user(nickname=None):
    """Creates a user + 1-day session directly in Mongo; returns (user_id, auth headers)"""
    uid = f"test-user-{uuid.uuid4().hex[:8]}"
    token = f"test_session_{uuid.uuid4().hex}"
    _created_ids.append(uid)
    mongo.users.insert_one({
        "user_id": uid, "email": f"test.user.{uid}@example.com", "name": "Test User", "picture": None,
        "nickname": nickname, "nickname_lower": nickname.casefold() if nickname else None,
        "total_points": 0, "daily_points": 0, "room_points": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    mongo.user_sessions.insert_one({
        "user_id": uid, "session_token": token,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=1), "created_at": datetime.now(timezone.utc),
    })
    return uid, {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session", autouse=True)
def cleanup_test_users():
    yield
    ids = list(_created_ids)
    for coll, field in [
        ("users", "user_id"), ("user_sessions", "user_id"), ("daily_games", "user_id"),
        ("room_results", "user_id"), ("room_players", "user_id"), ("solo_games", "user_id"),
        ("rooms", "host_user_id"),
    ]:
        mongo[coll].delete_many({field: {"$in": ids}})
