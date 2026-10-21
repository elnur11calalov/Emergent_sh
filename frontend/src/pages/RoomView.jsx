import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { ArrowLeft, Send, Crown, Copy, Trophy, Users, MessageCircle, Settings, Play, X, Hourglass } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import GameBoard from "../components/GameBoard";
import AzerbaijaniKeyboard from "../components/AzerbaijaniKeyboard";
import { KidMascot, useKidMood } from "../components/KidMascot";
import { MAX_ATTEMPTS, mergeUsedLetters, keyFromEvent } from "../lib/game";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const POLL_MS = 2000;

const TABS = [
  { id: "game", label: "Oyun", icon: Play },
  { id: "chat", label: "Çat", icon: MessageCircle },
  { id: "leaderboard", label: "Lider", icon: Trophy }
];

const tileColor = (r) =>
  r === "correct" ? "bg-green-600" : r === "present" ? "bg-yellow-500" : "bg-gray-700";

const MiniAttempts = ({ attempts, size = "w-6 h-6" }) => (
  <div className="flex flex-wrap gap-1">
    {attempts.map((a, i) => (
      <div key={i} className="flex gap-0.5">
        {a.guess.split("").map((ch, j) => (
          <div key={j} className={`${size} flex items-center justify-center text-xs font-bold rounded text-white ${tileColor(a.result[j])}`}>
            {ch}
          </div>
        ))}
      </div>
    ))}
  </div>
);

const RoomView = () => {
  const { roomCode } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const playerName = location.state?.playerName;
  const isHost = location.state?.isHost === true;
  const hostCode = location.state?.hostCode || "";

  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [activeTab, setActiveTab] = useState("game");
  const [currentGuess, setCurrentGuess] = useState("");
  const [usedLetters, setUsedLetters] = useState({});
  const [hostWord, setHostWord] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [gameMode, setGameMode] = useState("standard");
  const [timeLimit, setTimeLimit] = useState("");

  const { mood, react: kidReact, reset: kidReset } = useKidMood();
  const chatEndRef = useRef(null);
  const prevRoundRef = useRef(null);

  useEffect(() => {
    if (!playerName) navigate('/join-room');
  }, [playerName, navigate]);

  const refresh = useCallback(async () => {
    try {
      const [r, p, l, c] = await Promise.all([
        axios.get(`${API}/rooms/${roomCode}`),
        axios.get(`${API}/rooms/${roomCode}/players`),
        axios.get(`${API}/rooms/${roomCode}/leaderboard`),
        axios.get(`${API}/chat/${roomCode}`)
      ]);
      setRoom(r.data);
      setPlayers(p.data);
      setLeaderboard(l.data);
      setMessages(c.data);
      if (r.data.round_number !== prevRoundRef.current) {
        prevRoundRef.current = r.data.round_number;
        setCurrentGuess("");
        setUsedLetters({});
        kidReset();
      }
    } catch (e) {
      if (e.response?.status === 404) {
        toast.error("Oda tapılmadı");
        navigate('/');
      }
    }
  }, [roomCode, navigate, kidReset]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (activeTab === "chat") chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeTab]);

  const me = players.find((p) => p.player_name === playerName);
  const myAttempts = me?.current_attempts || [];
  const myCompleted = me?.current_completed || false;
  const canType = !isHost && !myCompleted && room?.game_active && activeTab === "game";

  const submitGuess = useCallback(async () => {
    if (currentGuess.length !== 5) {
      toast.error("5 hərfli söz daxil edin");
      return;
    }
    try {
      const res = await axios.post(`${API}/rooms/${roomCode}/guess`, { room_code: roomCode, player_name: playerName, guess: currentGuess });
      const { result, won, completed, points_earned } = res.data;
      setUsedLetters((prev) => mergeUsedLetters(prev, currentGuess, result));
      setCurrentGuess("");
      kidReact(result, won, completed);
      if (won) toast.success(`Təbriklər! +${points_earned} xal`);
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Xəta baş verdi");
    }
  }, [currentGuess, roomCode, playerName, kidReact, refresh]);

  const handleKeyPress = useCallback((key) => {
    if (!canType) return;
    if (key === "ENTER") submitGuess();
    else if (key === "BACKSPACE") setCurrentGuess((p) => p.slice(0, -1));
    else setCurrentGuess((p) => (p.length < 5 ? p + key : p));
  }, [canType, submitGuess]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.target.tagName === "INPUT") return;
      const key = keyFromEvent(e);
      if (key) handleKeyPress(key);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleKeyPress]);

  const sendChatMessage = async () => {
    if (!chatInput.trim()) return;
    try {
      await axios.post(`${API}/chat/send`, { room_code: roomCode, sender: playerName, message: chatInput.trim(), timestamp: new Date().toISOString() });
      setChatInput("");
      refresh();
    } catch (e) {
      toast.error("Mesaj göndərilmədi");
    }
  };

  const hostPost = (path, body) =>
    axios.post(`${API}/rooms/${roomCode}/${path}${path.includes("?") ? "&" : "?"}host_code=${encodeURIComponent(hostCode)}`, body);

  const handleStart = async () => {
    try {
      await hostPost(`set-word?word=${encodeURIComponent(hostWord)}`);
      await hostPost("start-game");
      setHostWord("");
      toast.success("Oyun başladı!");
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Xəta");
    }
  };

  const handleEndRound = async () => {
    try {
      await hostPost("end-round");
      toast.success("Raund bitdi");
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Xəta");
    }
  };

  const openSettings = () => {
    setGameMode(room.settings?.game_mode || "standard");
    setTimeLimit(room.settings?.time_limit ? String(room.settings.time_limit) : "");
    setShowSettings(true);
  };

  const handleSaveSettings = async () => {
    try {
      await hostPost("settings", { game_mode: gameMode, time_limit: timeLimit ? parseInt(timeLimit, 10) : null });
      toast.success("Parametrlər yadda saxlanıldı");
      setShowSettings(false);
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Xəta");
    }
  };

  const handleCloseRoom = async () => {
    if (!window.confirm("Odanı bağlamaq istəyirsiniz?")) return;
    try {
      await hostPost("close");
      toast.success("Oda bağlandı");
      navigate('/');
    } catch (e) {
      toast.error(e.response?.data?.detail || "Xəta");
    }
  };

  const copyCode = () => {
    navigator.clipboard?.writeText(roomCode);
    toast.success("Oda kodu kopyalandı");
  };

  if (!room) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-white" data-testid="room-loading">Yüklənir...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 p-3 md:p-4 pb-28">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <Button data-testid="back-button" onClick={() => navigate('/')} size="sm" className="bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-full">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Çıxış
          </Button>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="bg-white/10 border border-white/20 rounded-full px-4 py-2 text-white text-sm" data-testid="room-name">{room.room_name}</div>
            <Button data-testid="copy-code-button" onClick={copyCode} size="sm" className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-90 text-white rounded-full font-mono">
              <Copy className="w-4 h-4 mr-1" />
              <span data-testid="room-code">{roomCode}</span>
            </Button>
            {isHost && (
              <>
                <Button data-testid="settings-button" onClick={openSettings} size="sm" className="bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-full">
                  <Settings className="w-4 h-4" />
                </Button>
                <Button data-testid="close-room-button" onClick={handleCloseRoom} size="sm" className="bg-red-600 hover:bg-red-700 text-white rounded-full">
                  <X className="w-4 h-4" />
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="flex gap-2 mb-4 bg-white/5 rounded-full p-1 max-w-md mx-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              data-testid={`tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1 py-2 px-3 rounded-full text-sm font-semibold transition-colors ${activeTab === tab.id ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white' : 'text-white/60 hover:text-white'}`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            {activeTab === "game" && (
              <div className="bg-indigo-950/30 backdrop-blur-md border border-indigo-500/20 rounded-2xl p-4 md:p-6">
                {isHost ? (
                  <HostGameView room={room} players={players} hostWord={hostWord} setHostWord={setHostWord} onStart={handleStart} onEndRound={handleEndRound} />
                ) : (
                  <PlayerGameView room={room} myAttempts={myAttempts} myCompleted={myCompleted} currentGuess={currentGuess} usedLetters={usedLetters} onKeyPress={handleKeyPress} />
                )}
              </div>
            )}
            {activeTab === "chat" && (
              <ChatPanel messages={messages} playerName={playerName} chatInput={chatInput} setChatInput={setChatInput} onSend={sendChatMessage} endRef={chatEndRef} />
            )}
            {activeTab === "leaderboard" && <LeaderboardPanel leaderboard={leaderboard} />}
          </div>
          <PlayersPanel players={players} />
        </div>
      </div>

      <AnimatePresence>
        {showSettings && (
          <SettingsModal
            gameMode={gameMode}
            setGameMode={setGameMode}
            timeLimit={timeLimit}
            setTimeLimit={setTimeLimit}
            onCancel={() => setShowSettings(false)}
            onSave={handleSaveSettings}
          />
        )}
      </AnimatePresence>

      {!isHost && <KidMascot mood={room.game_active ? mood : "idle"} message={room.game_active ? undefined : "Host sözü hazırlayır..."} />}
    </div>
  );
};

const ChatPanel = ({ messages, playerName, chatInput, setChatInput, onSend, endRef }) => (
  <div className="bg-indigo-950/30 backdrop-blur-md border border-indigo-500/20 rounded-2xl p-4 flex flex-col h-[600px]">
    <h3 className="text-white font-bold mb-3 flex items-center gap-2"><MessageCircle className="w-5 h-5" /> Otaq Çatı</h3>
    <div className="flex-1 overflow-y-auto space-y-2 mb-3 pr-2" data-testid="chat-messages">
      {messages.length === 0 && <p className="text-white/40 text-center text-sm">Hələ mesaj yoxdur</p>}
      {messages.map((m, i) => {
        const mine = m.sender === playerName;
        return (
          <div key={`${m.timestamp}-${i}`} className={`flex ${mine ? 'justify-end' : 'justify-start'}`} data-testid="chat-message">
            <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-white ${mine ? 'bg-gradient-to-r from-indigo-600 to-purple-600' : 'bg-white/10'}`}>
              <div className="text-xs opacity-70 mb-0.5">{m.sender}</div>
              <div className="text-sm break-words">{m.message}</div>
            </div>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
    <div className="flex gap-2">
      <Input
        data-testid="chat-input"
        value={chatInput}
        onChange={(e) => setChatInput(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSend()}
        placeholder="Mesaj yazın..."
        className="bg-black/20 border-white/10 text-white"
      />
      <Button data-testid="chat-send-button" onClick={onSend} className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-90 text-white rounded-full">
        <Send className="w-4 h-4" />
      </Button>
    </div>
  </div>
);

const rankStyle = (i) =>
  i === 0 ? 'bg-gradient-to-r from-yellow-600/30 to-orange-600/30 border-yellow-500/30'
    : i === 1 ? 'bg-gradient-to-r from-slate-500/30 to-slate-400/30 border-slate-400/30'
    : i === 2 ? 'bg-gradient-to-r from-amber-700/30 to-amber-600/30 border-amber-600/30'
    : 'bg-white/5 border-white/10';

const LeaderboardPanel = ({ leaderboard }) => (
  <div className="bg-indigo-950/30 backdrop-blur-md border border-indigo-500/20 rounded-2xl p-4">
    <h3 className="text-white font-bold mb-3 flex items-center gap-2"><Trophy className="w-5 h-5 text-yellow-400" /> Lider Lövhəsi</h3>
    <div className="space-y-2" data-testid="leaderboard-list">
      {leaderboard.length === 0 && <p className="text-white/40 text-center text-sm">Hələ oyunçu yoxdur</p>}
      {leaderboard.map((p, i) => (
        <div key={p.player_name} className={`flex items-center justify-between rounded-xl px-4 py-3 border ${rankStyle(i)}`} data-testid={`leaderboard-row-${i}`}>
          <div className="flex items-center gap-3">
            <div className="text-2xl font-bold text-white w-8">{i + 1}</div>
            <div>
              <div className="text-white font-semibold">{p.player_name}</div>
              <div className="text-xs text-white/50">{p.games_won}/{p.games_played} qalib</div>
            </div>
          </div>
          <div className="text-xl font-bold text-yellow-400">{p.total_points}</div>
        </div>
      ))}
    </div>
  </div>
);

const PlayersPanel = ({ players }) => (
  <div className="bg-indigo-950/30 backdrop-blur-md border border-indigo-500/20 rounded-2xl p-4 h-fit">
    <h3 className="text-white font-bold mb-3 flex items-center gap-2"><Users className="w-5 h-5" /> Oyunçular ({players.length})</h3>
    <div className="space-y-2" data-testid="players-list">
      {players.length === 0 && <p className="text-white/40 text-sm">Hələ heç kim qoşulmayıb</p>}
      {players.map((p) => (
        <div key={p.player_name} className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${p.current_completed ? 'bg-green-400' : 'bg-yellow-400'}`} />
            <span className="text-white text-sm font-medium">{p.player_name}</span>
          </div>
          <div className="text-xs text-white/60">{p.current_attempts?.length || 0}/{MAX_ATTEMPTS}</div>
        </div>
      ))}
    </div>
  </div>
);

const SettingsModal = ({ gameMode, setGameMode, timeLimit, setTimeLimit, onCancel, onSave }) => (
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onCancel}>
    <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} onClick={(e) => e.stopPropagation()} className="bg-slate-900 border border-white/20 rounded-2xl p-6 max-w-md w-full" data-testid="settings-modal">
      <h3 className="text-white font-bold text-xl mb-4">Oda Parametrləri</h3>
      <div className="space-y-4">
        <div>
          <label className="text-sm text-white/70 mb-2 block">Oyun Rejimi</label>
          <div className="grid grid-cols-2 gap-2">
            <button data-testid="mode-standard" onClick={() => setGameMode("standard")} className={`p-3 rounded-xl border ${gameMode === 'standard' ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-white/5 border-white/10 text-white/70'}`}>Standart</button>
            <button data-testid="mode-rush" onClick={() => setGameMode("rush")} className={`p-3 rounded-xl border ${gameMode === 'rush' ? 'bg-orange-600 border-orange-400 text-white' : 'bg-white/5 border-white/10 text-white/70'}`}>Rush</button>
          </div>
          <p className="text-xs text-white/50 mt-1">{gameMode === 'rush' ? 'İlk düz cavab raundu bitirir' : 'Hamı 6 cəhd edə bilər'}</p>
        </div>
        <div>
          <label className="text-sm text-white/70 mb-2 block">Vaxt Limiti (saniyə, boş = limitsiz)</label>
          <Input data-testid="time-limit-input" type="number" value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)} placeholder="60" className="bg-black/20 border-white/10 text-white" />
        </div>
        <div className="flex gap-2">
          <Button data-testid="settings-cancel" onClick={onCancel} className="flex-1 bg-white/10 hover:bg-white/20 text-white">Ləğv</Button>
          <Button data-testid="settings-save" onClick={onSave} className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white">Yadda saxla</Button>
        </div>
      </div>
    </motion.div>
  </motion.div>
);

const HostGameView = ({ room, players, hostWord, setHostWord, onStart, onEndRound }) => {
  const allDone = players.length > 0 && players.every((p) => p.current_completed);
  return (
    <div data-testid="host-game-view">
      <div className="flex items-center gap-2 mb-4">
        <Crown className="w-6 h-6 text-yellow-400" />
        <h2 className="text-xl font-bold text-white">Host Paneli</h2>
        <span className="ml-auto text-sm text-white/60">
          Rejim: <span className="text-white font-semibold" data-testid="room-mode">{room.settings?.game_mode === 'rush' ? 'Rush' : 'Standart'}</span>
        </span>
      </div>

      {room.game_active ? (
        <>
          <div className="bg-emerald-900/30 border border-emerald-500/30 rounded-xl p-4 mb-4">
            <p className="text-emerald-300 text-sm mb-1">Cari söz (yalnız sizə görünür):</p>
            <p className="text-3xl font-bold text-white tracking-widest font-mono" data-testid="current-word">{room.current_word}</p>
            <p className="text-xs text-white/60 mt-2">Raund #{room.round_number}</p>
          </div>
          <Button data-testid="end-round-button" onClick={onEndRound} className="w-full bg-red-600 hover:bg-red-700 text-white mb-4">
            <X className="w-4 h-4 mr-1" />
            Raundu Bitir
          </Button>
          {allDone && (
            <div className="bg-yellow-900/30 border border-yellow-500/30 rounded-xl p-3 mb-4 text-center">
              <p className="text-yellow-300 text-sm">Bütün oyunçular cəhdlərini bitirdi</p>
            </div>
          )}
        </>
      ) : (
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-4">
          <label className="text-sm text-white/70 mb-2 block">5 hərfli söz daxil edin</label>
          <div className="flex gap-2">
            <Input
              data-testid="host-word-input"
              value={hostWord}
              onChange={(e) => setHostWord(e.target.value.toLocaleUpperCase("az").slice(0, 5))}
              maxLength={5}
              placeholder="SALAM"
              className="bg-black/20 border-white/10 text-white text-xl text-center tracking-widest font-mono uppercase"
            />
            <Button data-testid="start-round-button" onClick={onStart} disabled={hostWord.length !== 5} className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:opacity-90 text-white font-bold">
              <Play className="w-4 h-4 mr-1" />
              Başla
            </Button>
          </div>
          {room.round_number > 0 && <p className="text-xs text-emerald-400 mt-2">Raund #{room.round_number} bitdi. Yeni söz daxil edin.</p>}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3 mt-4" data-testid="live-attempts">
        {players.map((p) => (
          <div key={p.player_name} className="bg-white/5 border border-white/10 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-white font-semibold text-sm">{p.player_name}</span>
              <span className="text-xs text-white/60">{p.current_attempts?.length || 0}/{MAX_ATTEMPTS}</span>
            </div>
            {p.current_attempts?.length ? <MiniAttempts attempts={p.current_attempts} /> : <span className="text-white/30 text-xs">Hələ cəhd yoxdur</span>}
          </div>
        ))}
      </div>
    </div>
  );
};

const PlayerGameView = ({ room, myAttempts, myCompleted, currentGuess, usedLetters, onKeyPress }) => {
  if (!room.game_active) {
    return (
      <div className="text-center py-12" data-testid="waiting-screen">
        <Hourglass className="w-14 h-14 text-indigo-300 mx-auto mb-4 animate-pulse" />
        <h2 className="text-2xl font-bold text-white mb-2">Host sözü hazırlayır...</h2>
        <p className="text-white/60">Oyun tezliklə başlayacaq</p>
      </div>
    );
  }
  return (
    <div data-testid="player-game-view">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white">Raund #{room.round_number}</h2>
        <span className="text-sm text-white/60">Rejim: <span className="text-white">{room.settings?.game_mode === 'rush' ? 'Rush' : 'Standart'}</span></span>
      </div>
      <div className="mb-4">
        <GameBoard attempts={myAttempts} currentGuess={currentGuess} maxAttempts={MAX_ATTEMPTS} />
      </div>
      {myCompleted ? (
        <div className="text-center py-4 bg-white/5 rounded-xl" data-testid="player-completed">
          <p className="text-white">Cəhdlərinizi bitirdiniz. Host növbəti raundu başladanda davam edin.</p>
        </div>
      ) : (
        <AzerbaijaniKeyboard onKeyPress={onKeyPress} usedLetters={usedLetters} />
      )}
    </div>
  );
};

export default RoomView;
