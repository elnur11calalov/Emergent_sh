from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone
import random
import string
from azerbaijani_words import AZERBAIJANI_WORDS, DAILY_WORDS, get_random_word, get_daily_word, validate_word

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

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


def calculate_points(attempts_count: int, won: bool) -> int:
    if not won:
        return 0
    return POINT_SYSTEM.get(attempts_count, 0)


# ==================== Models ====================
class RoomCreate(BaseModel):
    host_name: str
    room_name: str
    host_code: str


class RoomSettings(BaseModel):
    game_mode: str = "standard"  # standard, rush
    time_limit: Optional[int] = None


class JoinRoom(BaseModel):
    room_code: str
    player_name: str


class ChatMessage(BaseModel):
    room_code: str
    sender: str
    message: str
    timestamp: str


class RoomGuess(BaseModel):
    room_code: str
    player_name: str
    guess: str


class SoloGameStart(BaseModel):
    player_name: str


class SoloGuess(BaseModel):
    game_id: str
    player_name: str
    guess: str


class DailyGuess(BaseModel):
    player_name: str
    guess: str


def generate_code(length=6):
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=length))


def check_guess(guess: str, target: str) -> List[str]:
    guess = guess.upper()
    target = target.upper()
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
    if host_code != "Elnur":
        raise HTTPException(status_code=403, detail="Yanlış host kodu!")
    return {"message": "Host doğrulandı", "verified": True}


# ==================== ROOMS ====================
@api_router.post("/rooms/create")
async def create_room(room_data: RoomCreate):
    if room_data.host_code != "Elnur":
        raise HTTPException(status_code=403, detail="Yalnız host oda yarada bilər!")

    room_code = generate_code()
    room_dict = {
        "room_code": room_code,
        "room_name": room_data.room_name,
        "host_name": room_data.host_name,
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
async def join_room(room_code: str, join_data: JoinRoom):
    room = await db.rooms.find_one({"room_code": room_code})
    if not room:
        raise HTTPException(status_code=404, detail="Oda tapılmadı")
    if room.get("status") == "closed":
        raise HTTPException(status_code=410, detail="Oda bağlanıb")

    participants = room.get("participants", [])
    if join_data.player_name in participants:
        return {"message": "Artıq odadasınız", "room_name": room["room_name"]}

    participants.append(join_data.player_name)
    await db.rooms.update_one(
        {"room_code": room_code},
        {"$set": {"participants": participants}}
    )

    player_stats = {
        "room_code": room_code,
        "player_name": join_data.player_name,
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
async def get_room(room_code: str):
    room = await db.rooms.find_one({"room_code": room_code}, {"_id": 0})
    if not room:
        raise HTTPException(status_code=404, detail="Oda tapılmadı")
    return room


@api_router.post("/rooms/{room_code}/set-word")
async def set_room_word(room_code: str, word: str, host_code: str):
    room = await db.rooms.find_one({"room_code": room_code})
    if not room:
        raise HTTPException(status_code=404, detail="Oda tapılmadı")
    if room.get("host_code") != host_code:
        raise HTTPException(status_code=403, detail="Yalnız host söz təyin edə bilər!")
    if len(word) != 5:
        raise HTTPException(status_code=400, detail="Söz 5 hərfli olmalıdır!")
    await db.rooms.update_one(
        {"room_code": room_code},
        {"$set": {"current_word": word.upper()}}
    )
    return {"message": "Söz təyin edildi"}


@api_router.post("/rooms/{room_code}/settings")
async def update_room_settings(room_code: str, settings: RoomSettings, host_code: str):
    room = await db.rooms.find_one({"room_code": room_code})
    if not room:
        raise HTTPException(status_code=404, detail="Oda tapılmadı")
    if room.get("host_code") != host_code:
        raise HTTPException(status_code=403, detail="Yalnız host parametrləri dəyişə bilər!")
    await db.rooms.update_one(
        {"room_code": room_code},
        {"$set": {"settings": settings.model_dump()}}
    )
    return {"message": "Parametrlər yeniləndi"}


@api_router.post("/rooms/{room_code}/start-game")
async def start_room_game(room_code: str, host_code: str):
    room = await db.rooms.find_one({"room_code": room_code})
    if not room:
        raise HTTPException(status_code=404, detail="Oda tapılmadı")
    if room.get("host_code") != host_code:
        raise HTTPException(status_code=403, detail="Yalnız host oyunu başlada bilər!")
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
async def end_room_round(room_code: str, host_code: str):
    room = await db.rooms.find_one({"room_code": room_code})
    if not room:
        raise HTTPException(status_code=404, detail="Oda tapılmadı")
    if room.get("host_code") != host_code:
        raise HTTPException(status_code=403, detail="Yalnız host raundu bitirə bilər!")
    await db.rooms.update_one(
        {"room_code": room_code},
        {"$set": {"game_active": False, "current_word": None}}
    )
    return {"message": "Raund bitdi"}


@api_router.post("/rooms/{room_code}/close")
async def close_room(room_code: str, host_code: str):
    room = await db.rooms.find_one({"room_code": room_code})
    if not room:
        raise HTTPException(status_code=404, detail="Oda tapılmadı")
    if room.get("host_code") != host_code:
        raise HTTPException(status_code=403, detail="Yalnız host odanı bağlaya bilər!")
    await db.rooms.update_one(
        {"room_code": room_code},
        {"$set": {"status": "closed", "game_active": False}}
    )
    return {"message": "Oda bağlandı"}


@api_router.post("/rooms/{room_code}/guess")
async def room_guess(room_code: str, guess_data: RoomGuess):
    room = await db.rooms.find_one({"room_code": room_code})
    if not room:
        raise HTTPException(status_code=404, detail="Oda tapılmadı")
    if not room.get("game_active"):
        raise HTTPException(status_code=400, detail="Oyun aktiv deyil")

    player = await db.room_players.find_one({
        "room_code": room_code,
        "player_name": guess_data.player_name
    })
    if not player:
        raise HTTPException(status_code=404, detail="Oyunçu tapılmadı")
    if player.get("current_completed"):
        raise HTTPException(status_code=400, detail="Siz artıq bitirmisiniz")
    if len(guess_data.guess) != 5:
        raise HTTPException(status_code=400, detail="Söz 5 hərfli olmalıdır!")

    result = check_guess(guess_data.guess, room["current_word"])
    attempt = {
        "guess": guess_data.guess.upper(),
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

    await db.room_players.update_one(
        {"room_code": room_code, "player_name": guess_data.player_name},
        {"$set": {
            "current_attempts": attempts,
            "current_completed": completed,
            "total_points": total_points,
            "games_won": games_won,
            "games_played": games_played
        }}
    )

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


@api_router.get("/rooms/{room_code}/leaderboard")
async def get_room_leaderboard(room_code: str):
    players = await db.room_players.find({"room_code": room_code}, {"_id": 0}).to_list(100)
    players.sort(key=lambda x: (-x.get("total_points", 0), x.get("joined_at", "")))
    return players


@api_router.get("/rooms/{room_code}/players")
async def get_room_players(room_code: str):
    players = await db.room_players.find({"room_code": room_code}, {"_id": 0}).to_list(100)
    return players


# ==================== CHAT ====================
@api_router.post("/chat/send")
async def send_message(message_data: ChatMessage):
    message_dict = {
        "room_code": message_data.room_code,
        "sender": message_data.sender,
        "message": message_data.message,
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
async def start_solo_game(game_data: SoloGameStart):
    game_id = str(uuid.uuid4())
    word = get_random_word()
    game_dict = {
        "game_id": game_id,
        "player_name": game_data.player_name,
        "word": word,
        "attempts": [],
        "completed": False,
        "won": False,
        "points": 0,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.solo_games.insert_one(game_dict)
    return {"game_id": game_id, "message": "Oyun başladı"}


@api_router.post("/solo/guess")
async def solo_game_guess(guess_data: SoloGuess):
    game = await db.solo_games.find_one({"game_id": guess_data.game_id})
    if not game:
        raise HTTPException(status_code=404, detail="Oyun tapılmadı")
    if game.get("completed"):
        raise HTTPException(status_code=400, detail="Oyun bitib")
    if len(guess_data.guess) != 5:
        raise HTTPException(status_code=400, detail="Söz 5 hərfli olmalıdır!")

    result = check_guess(guess_data.guess, game["word"])
    attempt = {
        "guess": guess_data.guess.upper(),
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
async def daily_game_guess(guess_data: DailyGuess):
    today = datetime.now(timezone.utc).date().isoformat()
    daily_word = get_daily_word()

    player_daily = await db.daily_games.find_one({
        "player_name": guess_data.player_name,
        "date": today
    })

    if not player_daily:
        player_daily = {
            "player_name": guess_data.player_name,
            "date": today,
            "attempts": [],
            "completed": False,
            "won": False,
            "points": 0,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.daily_games.insert_one(player_daily)

    if player_daily.get("completed"):
        raise HTTPException(status_code=400, detail="Bu gün artıq oynadınız")
    if len(guess_data.guess) != 5:
        raise HTTPException(status_code=400, detail="Söz 5 hərfli olmalıdır!")

    result = check_guess(guess_data.guess, daily_word)
    attempt = {
        "guess": guess_data.guess.upper(),
        "result": result,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    attempts = player_daily.get("attempts", [])
    attempts.append(attempt)

    won = all(r == "correct" for r in result)
    completed = won or len(attempts) >= 6
    points = calculate_points(len(attempts), True) if completed and won else 0

    await db.daily_games.update_one(
        {"player_name": guess_data.player_name, "date": today},
        {"$set": {"attempts": attempts, "completed": completed, "won": won, "points": points}}
    )

    if completed:
        await db.daily_leaderboard.update_one(
            {"player_name": guess_data.player_name},
            {
                "$inc": {"total_points": points, "games_played": 1},
                "$push": {"games": {"date": today, "points": points, "won": won}}
            },
            upsert=True
        )

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
    players.sort(key=lambda x: (-x.get("points", 0), x.get("created_at", "")))
    return players[:50]


# ==================== HOST PANEL ====================
@api_router.get("/host/active-rooms")
async def get_active_rooms(host_code: str):
    if host_code != "Elnur":
        raise HTTPException(status_code=403, detail="Yalnız host erişə bilər!")
    rooms = await db.rooms.find({"status": "active"}, {"_id": 0}).sort("created_at", -1).to_list(100)
    for room in rooms:
        room["participant_count"] = len(room.get("participants", []))
    return rooms


@api_router.get("/host/room-history")
async def get_room_history(host_code: str):
    if host_code != "Elnur":
        raise HTTPException(status_code=403, detail="Yalnız host erişə bilər!")
    rooms = await db.rooms.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    for room in rooms:
        players = await db.room_players.find({"room_code": room["room_code"]}, {"_id": 0}).to_list(100)
        room["players"] = players
    return rooms


@api_router.get("/host/game-history")
async def get_game_history(host_code: str):
    if host_code != "Elnur":
        raise HTTPException(status_code=403, detail="Yalnız host erişə bilər!")
    solo_games = await db.solo_games.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    daily_games = await db.daily_games.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"solo_games": solo_games, "daily_games": daily_games}


# ==================== WORDS ====================
@api_router.get("/words/random")
async def get_random_words(count: int = 5):
    words = random.sample(AZERBAIJANI_WORDS, min(count, 10))
    return {"words": words}


@api_router.post("/words/validate")
async def validate_word_endpoint(word: str):
    is_valid = validate_word(word)
    return {"valid": is_valid, "word": word.upper()}


# Include the router in the main app
app.include_router(api_router)

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


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
