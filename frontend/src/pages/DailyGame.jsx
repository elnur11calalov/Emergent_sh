import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { ArrowLeft, Calendar, Trophy, Clock } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import GameBoard from "../components/GameBoard";
import AzerbaijaniKeyboard from "../components/AzerbaijaniKeyboard";
import { KidMascot, useKidMood } from "../components/KidMascot";
import { MAX_ATTEMPTS, mergeUsedLetters, keyFromEvent } from "../lib/game";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const formatCountdown = (ms) => {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
};

const useCountdownToUtcMidnight = () => {
  const [countdown, setCountdown] = useState("");
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
      setCountdown(formatCountdown(next - now.getTime()));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return countdown;
};

const DailyGame = () => {
  const navigate = useNavigate();
  const [playerName, setPlayerName] = useState("");
  const [started, setStarted] = useState(false);
  const [attempts, setAttempts] = useState([]);
  const [currentGuess, setCurrentGuess] = useState("");
  const [usedLetters, setUsedLetters] = useState({});
  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);
  const [correctWord, setCorrectWord] = useState("");
  const [points, setPoints] = useState(0);
  const [leaderboard, setLeaderboard] = useState([]);
  const countdown = useCountdownToUtcMidnight();
  const kid = useKidMood();

  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/daily/leaderboard`);
      setLeaderboard(res.data);
    } catch (e) {
      // leaderboard is optional on this screen
    }
  }, []);

  useEffect(() => { fetchLeaderboard(); }, [fetchLeaderboard]);

  const startGame = () => {
    if (!playerName.trim()) {
      toast.error("Adınızı daxil edin");
      return;
    }
    setStarted(true);
  };

  const submitGuess = useCallback(async () => {
    if (currentGuess.length !== 5) {
      toast.error("5 hərfli söz daxil edin");
      return;
    }
    try {
      const res = await axios.post(`${API}/daily/guess`, { player_name: playerName.trim(), guess: currentGuess });
      const { result, completed, won: didWin, points: pts, correct_word } = res.data;
      setAttempts((prev) => [...prev, { guess: currentGuess, result }]);
      setUsedLetters((prev) => mergeUsedLetters(prev, currentGuess, result));
      setCurrentGuess("");
      kid.react(result, didWin, completed);
      if (completed) {
        setGameOver(true);
        setWon(didWin);
        setPoints(pts);
        setCorrectWord(correct_word || "");
        fetchLeaderboard();
      }
    } catch (e) {
      const detail = e.response?.data?.detail;
      if (detail === "Bu gün artıq oynadınız") {
        toast.info("Bu gün artıq oynadınız!");
        setGameOver(true);
      } else {
        toast.error(detail || "Xəta");
      }
    }
  }, [currentGuess, playerName, kid, fetchLeaderboard]);

  const handleKeyPress = useCallback((key) => {
    if (gameOver) return;
    if (key === "ENTER") submitGuess();
    else if (key === "BACKSPACE") setCurrentGuess((p) => p.slice(0, -1));
    else setCurrentGuess((p) => (p.length < 5 ? p + key : p));
  }, [gameOver, submitGuess]);

  useEffect(() => {
    if (!started) return;
    const onKeyDown = (e) => {
      const key = keyFromEvent(e);
      if (key) handleKeyPress(key);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [started, handleKeyPress]);

  if (!started) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-orange-950 to-red-950 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="max-w-md w-full">
          <div className="bg-orange-950/40 backdrop-blur-md border border-orange-500/20 rounded-2xl p-8">
            <Button
              data-testid="back-button"
              onClick={() => navigate('/')}
              className="mb-6 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-full"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Geri
            </Button>
            <div className="flex items-center justify-center mb-4">
              <Calendar className="w-10 h-10 text-orange-400 mr-3" />
              <h1 className="text-3xl md:text-4xl font-bold text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>Günlük Oyun</h1>
            </div>
            <div className="bg-black/20 rounded-xl p-3 mb-6 flex items-center justify-center gap-2">
              <Clock className="w-4 h-4 text-orange-400" />
              <span className="text-white text-sm">Növbəti söz:</span>
              <span className="text-orange-400 font-mono font-bold" data-testid="countdown">{countdown}</span>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-white/70 mb-2 block">Adınız</label>
                <Input
                  data-testid="player-name-input"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && startGame()}
                  placeholder="Adınızı daxil edin"
                  className="bg-black/20 border-white/10 text-white text-lg h-14"
                />
              </div>
              <Button
                data-testid="start-daily-button"
                onClick={startGame}
                className="w-full bg-gradient-to-r from-orange-600 to-red-600 hover:opacity-90 text-white h-14 text-lg rounded-full font-bold shadow-lg"
              >
                Oyuna Başla
              </Button>
            </div>
            {leaderboard.length > 0 && (
              <div className="mt-6" data-testid="daily-leaderboard">
                <h3 className="text-white font-bold mb-2 text-sm flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-yellow-400" /> Bugünkü Top
                </h3>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {leaderboard.slice(0, 5).map((p, i) => (
                    <div key={p.player_name} className="flex justify-between bg-white/5 rounded px-2 py-1 text-sm">
                      <span className="text-white">{i + 1}. {p.player_name}</span>
                      <span className="text-yellow-400 font-bold">{p.points}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </motion.div>
        <KidMascot mood="wave" message="Bugünkü sözü tapa bilərsən?" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-orange-950 to-red-950 p-4 pb-28">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <Button
            data-testid="back-button"
            onClick={() => navigate('/')}
            size="sm"
            className="bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-full"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Geri
          </Button>
          <h1 className="text-xl md:text-2xl font-bold text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>Günlük Oyun</h1>
          <div className="text-orange-400 font-mono text-sm" data-testid="countdown">{countdown}</div>
        </div>

        <div className="bg-orange-950/30 backdrop-blur-md border border-orange-500/20 rounded-2xl p-4 md:p-6 mb-4">
          <GameBoard attempts={attempts} currentGuess={currentGuess} maxAttempts={MAX_ATTEMPTS} />
        </div>

        <AnimatePresence>
          {gameOver && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={`${won ? 'bg-emerald-950/40 border-emerald-500/30' : 'bg-red-950/40 border-red-500/30'} backdrop-blur-md border rounded-2xl p-6 mb-4 text-center`}
              data-testid="game-result"
            >
              {won ? (
                <>
                  <Trophy className="w-12 h-12 text-yellow-400 mx-auto mb-2" />
                  <h2 className="text-2xl font-bold text-white">Təbriklər! +{points} xal</h2>
                </>
              ) : (
                <>
                  <h2 className="text-2xl font-bold text-white">Oyun bitdi</h2>
                  {correctWord && <p className="text-white/70 mt-1">Düzgün söz: <span className="font-bold text-white" data-testid="correct-word">{correctWord}</span></p>}
                </>
              )}
              <p className="text-white/50 text-sm mt-3">Növbəti söz {countdown} sonra</p>
            </motion.div>
          )}
        </AnimatePresence>

        {!gameOver && (
          <div className="bg-orange-950/30 backdrop-blur-md border border-orange-500/20 rounded-2xl p-3 md:p-4">
            <AzerbaijaniKeyboard onKeyPress={handleKeyPress} usedLetters={usedLetters} />
          </div>
        )}
      </div>
      <KidMascot mood={kid.mood} />
    </div>
  );
};

export default DailyGame;
