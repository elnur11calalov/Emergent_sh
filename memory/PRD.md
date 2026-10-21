# CoolabSchool Wordle (Azerbaijani) — PRD

## Original Problem Statement
An Azerbaijani version of Wordle called "CoolabSchool Wordle". It has 4 modes:
- **Join Room**: players join with a 6-character code
- **Create Room**: the host creates a room (Standard or Rush mode) and does not play. No host code is asked (the frontend sends `Elnur` automatically).
- **Solo Game**: one player, random word
- **Daily Game**: the same word for everyone, resets at 00:00 UTC

Other requirements: Azerbaijani keyboard (Ə Ç Ş Ğ Ö Ü İ I), chat in rooms, a leaderboard per room, and a Host Panel (password `Elnur`) with Active Rooms, Room History and Game History tabs. Scoring: 1 try = 2500, 2 = 1800, 3 = 1300, 4 = 900, 5 = 600, 6 = 400, fail = 0. The CoolabSchool logo is https://i.imgur.com/d63Fsdo.png. The footer says "By Elnur Calalov". The user speaks Azerbaijani.

## Architecture
- Backend: FastAPI `/app/backend/server.py`, all routes under `/api`, MongoDB collections rooms, room_players, chat_messages, solo_games, daily_games, daily_leaderboard.
- Dictionary: `/app/backend/azerbaijani_words.py` loads `/app/backend/five_letter_words.txt` (about 4725 words). The user asked to leave the dictionary as it is.
- Frontend: React + Tailwind + Shadcn + Framer Motion. "Real-time" means polling every 2 seconds.
  - pages: Home, JoinRoom, CreateRoom, RoomView, SoloGame, DailyGame, HostPanel
  - components: GameBoard, AzerbaijaniKeyboard, KidMascot (with the `useKidMood` hook)
  - lib/game.js: mergeUsedLetters, keyFromEvent

## Changelog
### Feb 2026 (this session)
- The preview was broken: the workspace had been reset, so the whole frontend was missing and App.js was the default Emergent splash page. The full frontend was rebuilt.
- Kid mascot (a cartoon schoolchild, bottom-left) on Home, Solo, Daily and Room (player view). It reacts to the game: wave, idle, happy, sad, win (jumps, stars) and lose (tears), with a speech bubble.
- Create Room asks for no host code.
- Players are sent to Home when the host closes the room.
- Daily progress is restored after a reload with the same name (new endpoint `GET /api/daily/status`). A finished daily game shows its result right away.
- After a round ends, the room waiting screen shows that round's result, and the mascot shows win or lose.
- Room identity (host or player) and the Host Panel login are kept in sessionStorage, so they survive a page reload.
- Room keyboard colors are rebuilt from the attempts saved on the server.
- The Home header no longer overflows on mobile, and Ctrl/Cmd/Alt shortcuts no longer type letters.
- Tests: iteration_1 and iteration_2 in /app/test_reports, all flows pass.

## Known gaps / Backlog
- P1: The room time limit is saved but not enforced (no countdown).
- P2: games_played does not count a round that ended before the player finished.
- P2: Daily player names are case-sensitive ("Ali" and "ali" are two different players).
- P2: The host code is hardcoded in the frontend (the user asked for this), and the host code is sent in query params.
- P2: No dictionary check on guesses or on the word the host picks.
- P2: Use WebSockets instead of polling; split server.py into routers.
