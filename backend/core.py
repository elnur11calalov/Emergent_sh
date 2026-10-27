"""Shared database handle, auth dependencies and account points helpers."""
import os
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from fastapi import HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(Path(__file__).parent / ".env")

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

HOST_CODE = "Elnur"
SESSION_COOKIE = "session_token"


def _token_from_request(request: Request):
    # Cookie first, Authorization header as fallback
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        return token
    auth = request.headers.get("Authorization", "")
    return auth[7:] if auth.startswith("Bearer ") else None


async def get_optional_user(request: Request):
    token = _token_from_request(request)
    if not token:
        return None
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        return None
    expires_at = session["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        return None
    return await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})


async def get_current_user(request: Request):
    user = await get_optional_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Google ilə daxil olun")
    return user


async def get_player(request: Request):
    """Signed-in user who has already chosen a nickname"""
    user = await get_current_user(request)
    if not user.get("nickname"):
        raise HTTPException(status_code=403, detail="Əvvəlcə ləqəb seçin")
    return user


def check_host_code(host_code: str):
    if host_code != HOST_CODE:
        raise HTTPException(status_code=403, detail="Yanlış host kodu!")


async def award_points(user_id: str, field: str, points: int):
    """Adds points to the account total; totals only ever grow"""
    if points <= 0:
        return
    await db.users.update_one(
        {"user_id": user_id},
        {
            "$inc": {"total_points": points, field: points},
            "$set": {"points_updated_at": datetime.now(timezone.utc).isoformat()},
        },
    )
