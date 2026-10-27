from fastapi import FastAPI, APIRouter, HTTPException, Query, Depends, Request
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pydantic import BaseModel
from typing import List, Optional
import uuid
from datetime import datetime, timezone
import random
import string
from azerbaijani_words import AZERBAIJANI_WORDS, get_random_word, get_daily_word, validate_word, az_upper
from core import db, client, get_player, get_optional_user, check_host_code, award_points
from auth_routes import router as auth_router

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Xal sistemi
POINT_SYSTEM = {
    1: 2500,
    2: 1800,
    3: 1300,
    4: 900,
    5: 600,
    6: 400,
    0: 0
}
# Günlük oyunda xallar ikiqatdır
DAILY_MULTIPLIER = 2


def calculate_points(attempts_count: int, won: bool) -> int:
    if not won:
        return 0
    return POINT_SYSTEM.get(attempts_count, 0)


# ==================== Models ====================
class RoomCreate(BaseModel):
    room_name: str
    host_code: str


class RoomSettings(BaseModel):
    game_mode: str = "standard"  # standard, rush
    time_limit: Optional[int] = None


class JoinRoom(BaseModel):
    room_code: str


class ChatMessage(BaseModel):
    room_code: str
    message: str


class RoomGuess(BaseModel):
    room_code: str
    guess: str


class SoloGameStart(BaseModel):
    player_name: Optional[str] = None


class SoloGuess(BaseModel):
    game_id: str
    guess: str


class DailyGuess(BaseModel):
    guess: str


def generate_code(length=6):
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=length))


def dictionary_word(word: str) -> str:
    """Normalizes a guess/host word and rejects anything not in the dictionary"""
    w = az_upper(word)
    if len(w) != 5:
        raise HTTPException(status_code=400, detail="Söz 5 hərfli olmalıdır!")
    if not validate_word(w):
        raise HTTPException(status_code=400, detail="Bu söz lüğətdə yoxdur")
    return w


def check_guess(guess: str, target: str) -> List[str]:
    guess = az_upper(guess)
    target = az_upper(target)
    result = []
    target_chars = list(target)

    for i, char in enumerate(guess):
        if char == target[i]:
            result.append("correct")
            target_chars[i] = None
        else:
            result.append("")

    for i, char in enumerate(guess):
        if result[i] == "":
            if char in target_chars:
                result[i] = "present"
                target_chars[target_chars.index(char)] = None
            else:
                result[i] = "absent"

    return result


# ==================== HEALTH ====================
@api_router.get("/")
async def root():
    return {"message": "CoolabSchool Wordle API"}


# ==================== HOST AUTH ====================
@api_router.post("/host/verify")
async def verify_host(host_code: str):
    check_host_code(host_code)
    return {"message": "Host doğrulandı", "verified": True}


# ==================== ROOMS ====================
@api_router.post("/rooms/create")
async def create_room(room_data: RoomCreate, user: dict = Depends(get_player)):
    check_host_code(room_data.host_code)

    room_code = generate_code()
    room_dict = {
        "room_code": room_code,
        "room_name": room_data.room_name,
        "host_name": user["nickname"],
        "host_user_id": user["user_id"],
        "host_code": room_data.host_code,
        "participants": [],
        "current_word": None,
        "game_active": False,
        "round_number": 0,
        "settings": {"game_mode": "standard", "time_limit": None},
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "active"
    }
    await db.rooms.insert_one(room_dict)
    return {"room_code": room_code, "message": "Oda yaradıldı"}


@api_router.post("/rooms/{room_code}/join")
async def join_room(room_code: str, join_data: JoinRoom, user: dict = Depends(get_player)):
    room = await db.rooms.find_one({"room_code": room_code})
    if not room:
        raise HTTPException(status_code=404, detail="Oda tapılmadı")
    if room.get("status") == "closed":
        raise HTTPException(status_code=410, detail="Oda bağlanıb")
    if room.get("host_user_id") == user["user_id"]:
        return {"message": "Siz bu odanın hostusunuz", "room_name": room["room_name"]}

    if await db.room_players.find_one({"room_code": room_code, "user_id": user["user_id"]}):
        return {"message": "Artıq odadasınız", "room_name": room["room_name"]}

    await db.rooms.update_one(
        {"room_code": room_code},
        {"$push": {"participants": user["nickname"]}}
    )

    player_stats = {
        "room_code": room_code,
        "user_id": user["user_id"],
        "player_name": user["nickname"],
        "total_points": 0,
        "games_won": 0,
        "games_played": 0,
        "current_attempts": [],
        "current_completed": False,
        "joined_at": datetime.now(timezone.utc).isoformat()
    }
    await db.room_players.insert_one(player_stats)
    return {"message": "Odaya qoşuldunuz", "room_name": room["room_name"]}


@api_router.get("/rooms/{room_code}")
async def get_room(room_code: str, request: Request):
    room = await db.rooms.find_one({"room_code": room_code}, {"_id": 0, "host_code": 0})
    if not room:
        raise HTTPException(status_code=404, detail="Oda tapılmadı")
    # The secret word is only visible to the room's host
    user = await get_optional_user(request)
    if not user or user["user_id"] != room.get("host_user_id"):
        room.pop("current_word", None)
    return room


async def require_room_host(room_code: str, host_code: str, user: dict) -> dict:
    room = await db.rooms.find_one({"room_code": room_code})
    if not room:
        raise HTTPException(status_code=404, detail="Oda tapılmadı")
    check_host_code(host_code)
    if room.get("host_user_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="Yalnız odanın hostu bunu edə bilər!")
    return room


@api_router.post("/rooms/{room_code}/set-word")
async def set_room_word(room_code: str, word: str, host_code: str, user: dict = Depends(get_player)):
    await require_room_host(room_code, host_code, user)
    word = dictionary_word(word)
    await db.rooms.update_one(
        {"room_code": room_code},
        {"$set": {"current_word": word}}
    )
    return {"message": "Söz təyin edildi"}


@api_router.post("/rooms/{room_code}/settings")
async def update_room_settings(room_code: str, settings: RoomSettings, host_code: str, user: dict = Depends(get_player)):
    await require_room_host(room_code, host_code, user)
    await db.rooms.update_one(
        {"room_code": room_code},
        {"$set": {"settings": settings.model_dump()}}
    )
    return {"message": "Parametrlər yeniləndi"}


@api_router.post("/rooms/{room_code}/start-game")
async def start_room_game(room_code: str, host_code: str, user: dict = Depends(get_player)):
    room = await require_room_host(room_code, host_code, user)
    if not room.get("current_word"):
        raise HTTPException(status_code=400, detail="Söz təyin edilməyib!")

    round_number = room.get("round_number", 0) + 1
    await db.rooms.update_one(
        {"room_code": room_code},
        {"$set": {
            "game_active": True,
            "round_number": round_number,
            "round_start_time": datetime.now(timezone.utc).isoformat()
        }}
    )
    await db.room_players.update_many(
        {"room_code": room_code},
        {"$set": {"current_attempts": [], "current_completed": False}}
    )
    return {"message": "Oyun başladı", "round_number": round_number}


@api_router.post("/rooms/{room_code}/end-round")
async def end_room_round(room_code: str, host_code: str, user: dict = Depends(get_player)):
    await require_room_host(room_code, host_code, user)
    await db.rooms.update_one(
        {"room_code": room_code},
        {"$set": {"game_active": False, "current_word": None}}
    )
    return {"message": "Raund bitdi"}


@api_router.post("/rooms/{room_code}/close")
async def close_room(room_code: str, host_code: str, user: dict = Depends(get_player)):
    await require_room_host(room_code, host_code, user)
    await db.rooms.update_one(
        {"room_code": room_code},
        {"$set": {"status": "closed", "game_active": False}}
    )
    return {"message": "Oda bağlandı"}


@api_router.post("/rooms/{room_code}/guess")
async def room_guess(room_code: str, guess_data: RoomGuess, user: dict = Depends(get_player)):
    room = await db.rooms.find_one({"room_code": room_code})
    if not room:
        raise HTTPException(status_code=404, detail="Oda tapılmadı")
    if not room.get("game_active"):
        raise HTTPException(status_code=400, detail="Oyun aktiv deyil")

    player_key = {"room_code": room_code, "user_id": user["user_id"]}
    player = await db.room_players.find_one(player_key)
    if not player:
        raise HTTPException(status_code=404, detail="Oyunçu tapılmadı")
    if player.get("current_completed"):
        raise HTTPException(status_code=400, detail="Siz artıq bitirmisiniz")
    guess = dictionary_word(guess_data.guess)

    result = check_guess(guess, room["current_word"])
    attempt = {
        "guess": guess,
        "result": result,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    attempts = player.get("current_attempts", [])
    attempts.append(attempt)

    won = all(r == "correct" for r in result)
    completed = won or len(attempts) >= 6

    points_earned = 0
    if completed and won:
        points_earned = calculate_points(len(attempts), True)

    total_points = player.get("total_points", 0) + points_earned
    games_won = player.get("games_won", 0) + (1 if won else 0)
    games_played = player.get("games_played", 0) + (1 if completed else 0)

    res = await db.room_players.update_one(
        # Only applies if nobody else changed this player's row meanwhile (no double points)
        {**player_key, "current_completed": False, "current_attempts": {"$size": len(attempts) - 1}},
        {"$set": {
            "current_attempts": attempts,
            "current_completed": completed,
            "total_points": total_points,
            "games_won": games_won,
            "games_played": games_played
        }}
    )
    if res.modified_count == 0:
        raise HTTPException(status_code=409, detail="Bu təxmin artıq qeydə alınıb")

    if completed:
        await db.room_results.insert_one({
            "user_id": user["user_id"],
            "room_code": room_code,
            "room_name": room.get("room_name"),
            "round_number": room.get("round_number"),
            "won": won,
            "attempts_count": len(attempts),
            "points": points_earned,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        await award_points(user["user_id"], "room_points", points_earned)

    if won and room.get("settings", {}).get("game_mode") == "rush":
        await db.rooms.update_one(
            {"room_code": room_code},
            {"$set": {"game_active": False}}
        )

    return {
        "result": result,
        "attempts_count": len(attempts),
        "completed": completed,
        "won": won,
        "points_earned": points_earned,
        "total_points": total_points
    }


async def visible_room_players(room_code: str, request: Request) -> list:
    room = await db.rooms.find_one({"room_code": room_code}, {"host_user_id": 1, "game_active": 1})
    players = await db.room_players.find({"room_code": room_code}, {"_id": 0}).to_list(100)
    user = await get_optional_user(request)
    viewer_id = user["user_id"] if user else None
    if room and room.get("game_active") and viewer_id != room.get("host_user_id"):
        # Hide other players' letters during an active round
        for p in players:
            if p.get("user_id") != viewer_id:
                p["current_attempts"] = [
                    {**a, "guess": " " * len(a.get("guess", ""))} for a in p.get("current_attempts", [])
                ]
    return players


@api_router.get("/rooms/{room_code}/leaderboard")
async def get_room_leaderboard(room_code: str, request: Request):
    players = await visible_room_players(room_code, request)
    players.sort(key=lambda x: (-x.get("total_points", 0), x.get("joined_at", "")))
    return players


@api_router.get("/rooms/{room_code}/players")
async def get_room_players(room_code: str, request: Request):
    return await visible_room_players(room_code, request)


# ==================== CHAT ====================
@api_router.post("/chat/send")
async def send_message(message_data: ChatMessage, user: dict = Depends(get_player)):
    text = message_data.message.strip()[:500]
    if not text:
        raise HTTPException(status_code=400, detail="Mesaj boşdur")
    room = await db.rooms.find_one({"room_code": message_data.room_code}, {"host_user_id": 1})
    if not room:
        raise HTTPException(status_code=404, detail="Oda tapılmadı")
    is_member = room.get("host_user_id") == user["user_id"] or await db.room_players.find_one(
        {"room_code": message_data.room_code, "user_id": user["user_id"]}
    )
    if not is_member:
        raise HTTPException(status_code=403, detail="Siz bu odada deyilsiniz")
    message_dict = {
        "room_code": message_data.room_code,
        "sender": user["nickname"],
        "sender_user_id": user["user_id"],
        "message": text,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    await db.chat_messages.insert_one(message_dict)
    return {"message": "Mesaj göndərildi"}


@api_router.get("/chat/{room_code}")
async def get_chat_messages(room_code: str, limit: int = 50):
    messages = await db.chat_messages.find({"room_code": room_code}, {"_id": 0}).sort("timestamp", 1).to_list(limit)
    return messages


# ==================== SOLO ====================
@api_router.post("/solo/start")
async def start_solo_game(game_data: SoloGameStart, request: Request):
    user = await get_optional_user(request)
    if user:
        # Signed-in players continue an unfinished game on any device
        active = await db.solo_games.find_one(
            {"user_id": user["user_id"], "completed": False}, {"_id": 0}, sort=[("created_at", -1)]
        )
        if active:
            return {"game_id": active["game_id"], "attempts": active["attempts"], "message": "Oyun davam edir"}
        player_name = user.get("nickname") or user.get("name")
    else:
        player_name = (game_data.player_name or "").strip() or "Qonaq"

    game_id = str(uuid.uuid4())
    word = get_random_word()
    game_dict = {
        "game_id": game_id,
        "user_id": user["user_id"] if user else None,
        "player_name": player_name,
        "word": word,
        "attempts": [],
        "completed": False,
        "won": False,
        "points": 0,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.solo_games.insert_one(game_dict)
    return {"game_id": game_id, "attempts": [], "message": "Oyun başladı"}


@api_router.post("/solo/guess")
async def solo_game_guess(guess_data: SoloGuess, request: Request):
    game = await db.solo_games.find_one({"game_id": guess_data.game_id})
    if not game:
        raise HTTPException(status_code=404, detail="Oyun tapılmadı")
    if game.get("user_id"):
        user = await get_optional_user(request)
        if not user or user["user_id"] != game["user_id"]:
            raise HTTPException(status_code=403, detail="Bu oyun sizə aid deyil")
    if game.get("completed"):
        raise HTTPException(status_code=400, detail="Oyun bitib")
    guess = dictionary_word(guess_data.guess)

    result = check_guess(guess, game["word"])
    attempt = {
        "guess": guess,
        "result": result,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    attempts = game.get("attempts", [])
    attempts.append(attempt)

    won = all(r == "correct" for r in result)
    completed = won or len(attempts) >= 6

    points = calculate_points(len(attempts), True) if completed and won else 0

    await db.solo_games.update_one(
        {"game_id": guess_data.game_id},
        {"$set": {"attempts": attempts, "completed": completed, "won": won, "points": points}}
    )

    return {
        "result": result,
        "attempts_count": len(attempts),
        "completed": completed,
        "won": won,
        "points": points,
        "correct_word": game["word"] if completed else None
    }


# ==================== DAILY ====================
@api_router.get("/daily/word")
async def get_daily_game_word():
    word = get_daily_word()
    today = datetime.now(timezone.utc).date().isoformat()
    return {"date": today, "word_length": len(word), "message": "Günlük oyun hazırdır"}


@api_router.post("/daily/guess")
async def daily_game_guess(guess_data: DailyGuess, user: dict = Depends(get_player)):
    today = datetime.now(timezone.utc).date().isoformat()
    daily_word = get_daily_word()

    guess = dictionary_word(guess_data.guess)

    daily_key = {"user_id": user["user_id"], "date": today}
    player_daily = await db.daily_games.find_one(daily_key)

    if not player_daily:
        player_daily = {
            **daily_key,
            "player_name": user["nickname"],
            "attempts": [],
            "completed": False,
            "won": False,
            "points": 0,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.daily_games.insert_one(dict(player_daily))

    if player_daily.get("completed"):
        raise HTTPException(status_code=400, detail="Bu gün artıq oynadınız")

    result = check_guess(guess, daily_word)
    attempt = {
        "guess": guess,
        "result": result,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    attempts = player_daily.get("attempts", [])
    attempts.append(attempt)

    won = all(r == "correct" for r in result)
    completed = won or len(attempts) >= 6
    points = calculate_points(len(attempts), True) * DAILY_MULTIPLIER if completed and won else 0

    res = await db.daily_games.update_one(
        {**daily_key, "completed": False, "attempts": {"$size": len(attempts) - 1}},
        {"$set": {"attempts": attempts, "completed": completed, "won": won, "points": points}}
    )
    if res.modified_count == 0:
        raise HTTPException(status_code=409, detail="Bu təxmin artıq qeydə alınıb")

    if completed:
        await award_points(user["user_id"], "daily_points", points)

    return {
        "result": result,
        "attempts_count": len(attempts),
        "completed": completed,
        "won": won,
        "points": points,
        "correct_word": daily_word if completed else None
    }


@api_router.get("/daily/leaderboard")
async def get_daily_leaderboard():
    today = datetime.now(timezone.utc).date().isoformat()
    players = await db.daily_games.find({"date": today, "completed": True}, {"_id": 0}).to_list(100)
    for p in players:
        p["attempts_count"] = len(p.pop("attempts", []))
    players.sort(key=lambda x: (-x.get("points", 0), x.get("created_at", "")))
    return players[:50]


@api_router.get("/daily/status")
async def get_daily_status(user: dict = Depends(get_player)):
    today = datetime.now(timezone.utc).date().isoformat()
    doc = await db.daily_games.find_one({"user_id": user["user_id"], "date": today}, {"_id": 0})
    if not doc:
        return {"attempts": [], "completed": False, "won": False, "points": 0, "correct_word": None}
    return {
        "attempts": doc.get("attempts", []),
        "completed": doc.get("completed", False),
        "won": doc.get("won", False),
        "points": doc.get("points", 0),
        "correct_word": get_daily_word() if doc.get("completed") else None
    }


# ==================== HOST PANEL ====================
@api_router.get("/host/active-rooms")
async def get_active_rooms(host_code: str, user: dict = Depends(get_player)):
    check_host_code(host_code)
    rooms = await db.rooms.find({"status": "active"}, {"_id": 0, "host_code": 0}).sort("created_at", -1).to_list(100)
    for room in rooms:
        room["participant_count"] = len(room.get("participants", []))
        if room.get("host_user_id") != user["user_id"]:
            room.pop("current_word", None)
    return rooms


@api_router.get("/host/room-history")
async def get_room_history(host_code: str, user: dict = Depends(get_player)):
    check_host_code(host_code)
    rooms = await db.rooms.find({}, {"_id": 0, "host_code": 0}).sort("created_at", -1).to_list(500)
    for room in rooms:
        players = await db.room_players.find({"room_code": room["room_code"]}, {"_id": 0}).to_list(100)
        if room.get("host_user_id") != user["user_id"]:
            room.pop("current_word", None)
            if room.get("game_active"):
                for p in players:
                    p["current_attempts"] = [
                        {**a, "guess": " " * len(a.get("guess", ""))} for a in p.get("current_attempts", [])
                    ]
        room["players"] = players
    return rooms


@api_router.get("/host/game-history")
async def get_game_history(host_code: str, user: dict = Depends(get_player)):
    check_host_code(host_code)
    solo_games = await db.solo_games.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    for g in solo_games:
        if not g.get("completed"):
            g["word"] = "?????"
            g["attempts"] = [{**a, "guess": " " * len(a.get("guess", ""))} for a in g.get("attempts", [])]
    today = datetime.now(timezone.utc).date().isoformat()
    daily_games = await db.daily_games.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    for g in daily_games:
        if g.get("date") == today:
            g["attempts"] = [{**a, "guess": " " * len(a.get("guess", ""))} for a in g.get("attempts", [])]
    return {"solo_games": solo_games, "daily_games": daily_games}


# ==================== WORDS ====================
@api_router.get("/words/random")
async def get_random_words(count: int = Query(5, ge=1, le=10)):
    words = random.sample(AZERBAIJANI_WORDS, count)
    return {"words": words}


@api_router.post("/words/validate")
async def validate_word_endpoint(word: str):
    is_valid = validate_word(word)
    return {"valid": is_valid, "word": az_upper(word)}


# Include the routers in the main app
app.include_router(api_router)
app.include_router(auth_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def create_indexes():
    # Nicknames are unique regardless of letter case
    await db.users.create_index(
        "nickname_lower", unique=True, partialFilterExpression={"nickname_lower": {"$type": "string"}}
    )


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
