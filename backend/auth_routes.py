"""Google sign-in (Emergent Auth), nickname, profile and overall leaderboard."""
import re
import uuid
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from core import SESSION_COOKIE, db, get_current_user

router = APIRouter(prefix="/api")

EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"
SESSION_DAYS = 7
NICKNAME_RE = re.compile(r"^[\wƏəÇçŞşĞğÖöÜüİıI .-]{2,20}$")


class SessionRequest(BaseModel):
    session_id: str


class NicknameRequest(BaseModel):
    nickname: str


def public_user(user: dict) -> dict:
    return {
        "user_id": user["user_id"],
        "email": user["email"],
        "name": user.get("name"),
        "picture": user.get("picture"),
        "nickname": user.get("nickname"),
        "total_points": user.get("total_points", 0),
        "daily_points": user.get("daily_points", 0),
        "room_points": user.get("room_points", 0),
    }


@router.post("/auth/session")
async def create_session(body: SessionRequest, response: Response):
    async with httpx.AsyncClient(timeout=15) as http:
        r = await http.get(EMERGENT_SESSION_URL, headers={"X-Session-ID": body.session_id})
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Giriş alınmadı")
    data = r.json()
    now = datetime.now(timezone.utc)

    user = await db.users.find_one({"email": data["email"]}, {"_id": 0})
    if user:
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"name": data.get("name"), "picture": data.get("picture")}},
        )
        user.update({"name": data.get("name"), "picture": data.get("picture")})
    else:
        user = {
            "user_id": f"user_{uuid.uuid4().hex[:12]}",
            "email": data["email"],
            "name": data.get("name"),
            "picture": data.get("picture"),
            "nickname": None,
            "nickname_lower": None,
            "total_points": 0,
            "daily_points": 0,
            "room_points": 0,
            "created_at": now.isoformat(),
        }
        await db.users.insert_one(dict(user))

    await db.user_sessions.insert_one({
        "user_id": user["user_id"],
        "session_token": data["session_token"],
        "expires_at": now + timedelta(days=SESSION_DAYS),
        "created_at": now,
    })
    response.set_cookie(
        SESSION_COOKIE, data["session_token"], max_age=SESSION_DAYS * 86400,
        httponly=True, secure=True, samesite="none", path="/",
    )
    return public_user(user)


@router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return public_user(user)


@router.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie(SESSION_COOKIE, path="/", secure=True, samesite="none")
    return {"message": "Çıxış edildi"}


@router.put("/auth/nickname")
async def set_nickname(body: NicknameRequest, user: dict = Depends(get_current_user)):
    nickname = " ".join(body.nickname.split())
    if not NICKNAME_RE.match(nickname):
        raise HTTPException(status_code=400, detail="Ləqəb 2-20 simvol olmalıdır (hərf, rəqəm, boşluq)")
    lower = nickname.casefold()
    taken = await db.users.find_one({"nickname_lower": lower, "user_id": {"$ne": user["user_id"]}})
    if taken:
        raise HTTPException(status_code=409, detail="Bu ləqəb artıq istifadə olunur")
    await db.users.update_one(
        {"user_id": user["user_id"]}, {"$set": {"nickname": nickname, "nickname_lower": lower}}
    )
    user.update({"nickname": nickname})
    return public_user(user)


def _mode_stats(games: list) -> dict:
    won = [g for g in games if g.get("won")]
    return {"played": len(games), "won": len(won)}


@router.get("/profile/me")
async def profile(user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    daily = await db.daily_games.find({"user_id": uid, "completed": True}, {"_id": 0}).to_list(2000)
    solo = await db.solo_games.find({"user_id": uid, "completed": True}, {"_id": 0}).to_list(2000)
    rooms = await db.room_results.find({"user_id": uid}, {"_id": 0}).to_list(2000)

    distribution = {str(i): 0 for i in range(1, 7)}
    for g in daily + solo:
        if g.get("won"):
            distribution[str(len(g.get("attempts", [])))] += 1
    for g in rooms:
        if g.get("won"):
            distribution[str(g["attempts_count"])] += 1

    recent = (
        [{"mode": "daily", "won": g["won"], "points": g.get("points", 0), "attempts": len(g["attempts"]), "date": g["created_at"]} for g in daily]
        + [{"mode": "solo", "won": g["won"], "points": 0, "attempts": len(g["attempts"]), "date": g["created_at"]} for g in solo]
        + [{"mode": "room", "won": g["won"], "points": g["points"], "attempts": g["attempts_count"], "date": g["created_at"], "room_name": g.get("room_name")} for g in rooms]
    )
    recent.sort(key=lambda g: g["date"], reverse=True)

    rank = await db.users.count_documents({"total_points": {"$gt": user.get("total_points", 0)}, "nickname": {"$ne": None}}) + 1
    return {
        "user": public_user(user),
        "rank": rank,
        "daily": _mode_stats(daily),
        "room": _mode_stats(rooms),
        "solo": _mode_stats(solo),
        "distribution": distribution,
        "recent": recent[:10],
    }


@router.get("/leaderboard/overall")
async def overall_leaderboard():
    users = await db.users.find(
        {"nickname": {"$ne": None}},
        {"_id": 0, "user_id": 1, "nickname": 1, "picture": 1, "total_points": 1, "daily_points": 1, "room_points": 1, "points_updated_at": 1},
    ).to_list(1000)
    # Higher total first; on a tie, whoever reached it earlier wins
    users.sort(key=lambda u: (-u.get("total_points", 0), u.get("points_updated_at") or "9999"))
    return users[:100]
