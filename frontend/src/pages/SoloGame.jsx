import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { ArrowLeft, Trophy, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import GameBoard from "../components/GameBoard";
import AzerbaijaniKeyboard from "../components/AzerbaijaniKeyboard";
import { KidMascot, useKidMood } from "../components/KidMascot";
import { MAX_ATTEMPTS, mergeUsedLetters, keyFromEvent } from "../lib/game";
import { playSound, playKeySound, playResultSound } from "../lib/sounds";
import { useAuth } from "../lib/auth";
import { GoogleButton } from "../components/Auth";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SoloGame = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [playerName, setPlayerName] = useState("");
  const [gameId, setGameId] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [currentGuess, setCurrentGuess] = useState("");
  const [usedLetters, setUsedLetters] = useState({});
  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);
  const [correctWord, setCorrectWord] = useState("");
  const [points, setPoints] = useState(0);
  const [loading, setLoading] = useState(false);
  const kid = useKidMood();
  const submittingRef = useRef(false);

  // Signed-in players use their nickname and continue an unfinished game
  const startGame = async () => {
    if (!user && !playerName.trim()) {
      toast.error("Adınızı daxil edin");
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post(`${API}/solo/start`, { player_name: user ? null : playerName.trim() });
      setAttempts(res.data.attempts);
      setUsedLetters(res.data.attempts.reduce((acc, a) => mergeUsedLetters(acc, a.guess, a.result), {}));
      setGameId(res.data.game_id);
    } catch (e) {
      toast.error("Oyun başlatmaq mümkün olmadı");
    } finally {
      setLoading(false);
    }
  };

  const submitGuess = useCallback(async () => {
    if (currentGuess.length !== 5) {
      playSound("error");
      toast.error("5 hərfli söz daxil edin");
      return;
    }
    try {
      const res = await axios.post(`${API}/solo/guess`, { game_id: gameId, guess: currentGuess });
      const { result, completed, won: didWin, points: pts, correct_word } = res.data;
      setAttempts((prev) => [...prev, { guess: currentGuess, result }]);
      setUsedLetters((prev) => mergeUsedLetters(prev, currentGuess, result));
      setCurrentGuess("");
      kid.react(result, didWin, completed);
      playResultSound(result, didWin, completed);
      if (completed) {
        setGameOver(true);
        setWon(didWin);
        setPoints(pts);
        setCorrectWord(correct_word || "");
      }
    } catch (e) {
      playSound("error");
      toast.error(e.response?.data?.detail || "Xəta baş verdi");
    }
  }, [currentGuess, gameId, kid]);

  const handleKeyPress = useCallback((key) => {
    if (gameOver) return;
    playKeySound(key);
    if (key === "ENTER") {
      if (submittingRef.current) return;
      submittingRef.current = true;
      submitGuess().finally(() => { submittingRef.current = false; });
    }
    else if (key === "BACKSPACE") setCurrentGuess((p) => p.slice(0, -1));
    else setCurrentGuess((p) => (p.length < 5 ? p + key : p));
  }, [gameOver, submitGuess]);

  useEffect(() => {
    if (!gameId) return;
    const onKeyDown = (e) => {
      const key = keyFromEvent(e);
      if (!key) return;
      if (key === "ENTER") e.preventDefault();
      handleKeyPress(key);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [gameId, handleKeyPress]);

  const restart = () => {
    setGameId(null);
    setAttempts([]);
    setCurrentGuess("");
    setUsedLetters({});
    setGameOver(false);
    setWon(false);
    setCorrectWord("");
    setPoints(0);
    kid.reset();
  };

  if (!gameId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-cyan-950 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="max-w-md w-full">
          <div className="bg-blue-950/40 backdrop-blur-md border border-blue-500/20 rounded-2xl p-8">
            <Button
              data-testid="back-button"
              onClick={() => navigate('/')}
              className="mb-6 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white rounded-full"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Geri
            </Button>
            <h1 className="text-4xl font-bold text-white mb-8 text-center" style={{ fontFamily: 'Outfit, sans-serif' }}>Tək Oyun</h1>
            <div className="space-y-4">
              {user ? (
                <p className="text-center text-white/70" data-testid="solo-signed-in">Oyunçu: <span className="text-white font-semibold">{user.nickname}</span></p>
              ) : (
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
                  <p className="text-xs text-white/40 mt-2" data-testid="guest-note">Qonaq rejimi: nəticələr hesabda saxlanılmır.</p>
                </div>
              )}
              <Button
                data-testid="start-solo-button"
                onClick={startGame}
                disabled={loading}
                className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:opacity-90 text-white h-14 text-lg rounded-full font-bold shadow-lg"
              >
                {loading ? "Başlayır..." : "Oyuna Başla"}
              </Button>
              {!user && <GoogleButton className="w-full h-12" returnPath="/solo" />}
            </div>
          </div>
        </motion.div>
        <KidMascot mood="wave" message={user ? "Hazırsan? Başlayaq!" : "Adını yaz, başlayaq!"} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-cyan-950 p-4 pb-40">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Button
            data-testid="back-button"
            onClick={() => navigate('/')}
            className="bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white rounded-full"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Geri
          </Button>
          <h1 className="text-2xl md:text-3xl font-bold text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>Tək Oyun</h1>
          <div className="text-white/70 text-sm" data-testid="player-display">{user ? user.nickname : playerName}</div>
        </div>

        <div className="bg-blue-950/30 backdrop-blur-md border border-blue-500/20 rounded-2xl p-4 md:p-6 mb-4">
          <GameBoard attempts={attempts} currentGuess={currentGuess} maxAttempts={MAX_ATTEMPTS} />
        </div>

        <AnimatePresence>
          {gameOver && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`${won ? 'bg-emerald-950/40 border-emerald-500/30' : 'bg-red-950/40 border-red-500/30'} backdrop-blur-md border rounded-2xl p-6 mb-4 text-center`}
              data-testid="game-result"
            >
              {won ? (
                <>
                  <Trophy className="w-12 h-12 text-yellow-400 mx-auto mb-2" />
                  <h2 className="text-2xl font-bold text-white mb-1">Təbriklər!</h2>
                  <p className="text-emerald-300" data-testid="points-earned">{points} xal qazandınız</p>
                </>
              ) : (
                <>
                  <h2 className="text-2xl font-bold text-white mb-1">Oyun bitdi</h2>
                  <p className="text-white/70">Düzgün söz: <span className="font-bold text-white" data-testid="correct-word">{correctWord}</span></p>
                </>
              )}
              <Button
                data-testid="restart-button"
                onClick={restart}
                className="mt-4 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-full"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Yenidən Oyna
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {!gameOver && (
          <div className="bg-blue-950/30 backdrop-blur-md border border-blue-500/20 rounded-2xl p-3 md:p-4">
            <AzerbaijaniKeyboard onKeyPress={handleKeyPress} usedLetters={usedLetters} />
          </div>
        )}
      </div>
      <KidMascot mood={kid.mood} />
    </div>
  );
};

export default SoloGame;
