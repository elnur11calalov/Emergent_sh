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
- Dictionary: `/app/backend/azerbaijani_words.py` loads the user's STATIC dictionary `/app/backend/Bes_herfli_sozler.md` once at import (2213 words; replaced five_letter_words.md on user request). Never edit, print or analyze the file. `az_upper()` does Azerbaijani-aware, case-insensitive matching (i→İ, ı→I, Cyrillic Х→X, strips U+0307). Guesses and host words that are not in the dictionary are rejected with 400 "Bu söz lüğətdə yoxdur".
- Sounds: `/app/frontend/src/lib/sounds.js`. These are one-shot Web Audio tones (click, key, delete, error, happy, sad, win, lose, start, message). They never loop. App.js plays the click sound globally.
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
- The old dictionary was replaced by the uploaded five_letter_words.md (static). Guesses and host words are now checked against the dictionary, without regard to letter case.
- Sound effects for clicks, keys, results (happy, sad, win, lose), errors, round start and incoming chat. All one-shot, with no loops (checked in iteration_3).
- Fixed a double submit: clicking the on-screen ENTER and then pressing the physical Enter sent the same guess twice. Keyboard keys no longer take focus, and an in-flight guard was added.
- /api/words/random validates count (1-10).
- The dictionary was replaced again with the user's Bes_herfli_sozler.md (2213 words, static). The old file was deleted. Proper Azerbaijani lower, upper and mixed case is matched for 100% of the words.

## Known gaps / Backlog
- P1: The room time limit is saved but not enforced (no countdown).
- P2: games_played does not count a round that ended before the player finished.
- P2: Daily player names are case-sensitive ("Ali" and "ali" are two different players).
- P2: The host code is hardcoded in the frontend (the user asked for this), and the host code is sent in query params.
- P2: No mute button for sounds.
- P2: Use WebSockets instead of polling; split server.py into routers.

## 2026-06 Security fixes
- Target word hidden from players: GET /rooms/{code} (host only), daily status/guess (only after finish), daily leaderboard (attempts_count only), room players/leaderboard (other players letters masked during active round), host panel (current_word only for own rooms, active solo / today daily masked).
- Host room controls require login + room ownership + code Elnur. Chat send requires membership. Solo guess ownership check.
- Backend tests: 54/54 pass (tests/test_security_fixes.py added).

## Backlog
- P2: Chat read requires membership; nickname change sync to old records; split server.py into routers.
