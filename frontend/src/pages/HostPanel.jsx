import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { ArrowLeft, Crown, Users, Calendar, Trophy, X, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const HOST_CODE = "Elnur";

const tileColor = (r) =>
  r === "correct" ? "bg-green-600" : r === "present" ? "bg-yellow-500" : "bg-gray-700";

const HostLogin = ({ onSuccess, onBack }) => {
  const [pwd, setPwd] = useState("");
  const verify = () => {
    if (pwd === HOST_CODE) onSuccess();
    else toast.error("Yanlış kod");
  };
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="max-w-md w-full">
        <div className="bg-purple-950/40 backdrop-blur-md border border-purple-500/20 rounded-2xl p-8">
          <Button data-testid="back-button" onClick={onBack} className="mb-6 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-full">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Geri
          </Button>
          <div className="flex items-center justify-center mb-6">
            <Crown className="w-10 h-10 text-yellow-400 mr-3" />
            <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>Host Panel</h1>
          </div>
          <div className="space-y-4">
            <Input
              data-testid="host-password-input"
              type="password"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && verify()}
              placeholder="Host kodu"
              className="bg-black/20 border-white/10 text-white text-lg h-14"
            />
            <Button data-testid="host-login-button" onClick={verify} className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 text-white h-14 text-lg rounded-full font-bold">
              Daxil ol
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const HostPanel = () => {
  const navigate = useNavigate();
  const [authed, setAuthed] = useState(() => sessionStorage.getItem("hostAuthed") === "1");
  const [activeTab, setActiveTab] = useState("active");
  const [activeRooms, setActiveRooms] = useState([]);
  const [historyRooms, setHistoryRooms] = useState([]);
  const [gameHistory, setGameHistory] = useState({ solo_games: [], daily_games: [] });
  const [selectedCode, setSelectedCode] = useState(null);

  useEffect(() => {
    if (!authed) return;
    const fetchData = async () => {
      try {
        const q = `host_code=${HOST_CODE}`;
        const [active, history, games] = await Promise.all([
          axios.get(`${API}/host/active-rooms?${q}`),
          axios.get(`${API}/host/room-history?${q}`),
          axios.get(`${API}/host/game-history?${q}`)
        ]);
        setActiveRooms(active.data);
        setHistoryRooms(history.data);
        setGameHistory(games.data);
      } catch (e) {
        toast.error("Məlumatlar yüklənmədi");
      }
    };
    fetchData();
    const id = setInterval(fetchData, 3000);
    return () => clearInterval(id);
  }, [authed]);

  const login = () => {
    sessionStorage.setItem("hostAuthed", "1");
    setAuthed(true);
  };
  const logout = () => {
    sessionStorage.removeItem("hostAuthed");
    setAuthed(false);
  };

  if (!authed) return <HostLogin onSuccess={login} onBack={() => navigate('/')} />;

  // room-history contains players; use it for the detail modal so it stays live
  const selectedRoom = historyRooms.find((r) => r.room_code === selectedCode);
  const tabs = [
    { id: "active", label: "Aktiv Otaqlar", icon: Users, count: activeRooms.length },
    { id: "history", label: "Otaq Tarixi", icon: Calendar, count: historyRooms.length },
    { id: "games", label: "Oyun Tarixi", icon: Trophy, count: gameHistory.solo_games.length + gameHistory.daily_games.length }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
          <Button data-testid="back-button" onClick={() => navigate('/')} className="bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-full">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Ana səhifə
          </Button>
          <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
            <Crown className="w-7 h-7 text-yellow-400" /> Host Panel
          </h1>
          <Button data-testid="logout-button" onClick={logout} className="bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-full">
            Çıxış
          </Button>
        </div>

        <div className="flex gap-2 mb-6 bg-white/5 rounded-full p-1 max-w-2xl mx-auto flex-wrap">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              data-testid={`tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 min-w-[120px] flex items-center justify-center gap-1 py-2 px-3 rounded-full text-sm font-semibold transition-colors ${activeTab === tab.id ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white' : 'text-white/60 hover:text-white'}`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              <span className="ml-1 bg-white/20 rounded-full px-2 text-xs">{tab.count}</span>
            </button>
          ))}
        </div>

        {activeTab === "active" && <RoomGrid rooms={activeRooms} empty="Aktiv otaq yoxdur" onSelect={setSelectedCode} />}
        {activeTab === "history" && <RoomGrid rooms={historyRooms} empty="Tarix yoxdur" onSelect={setSelectedCode} showStatus />}
        {activeTab === "games" && (
          <div className="grid md:grid-cols-2 gap-4">
            <GameList title="Tək Oyunlar" games={gameHistory.solo_games} sub={(g) => `Söz: ${g.word} • ${g.attempts?.length || 0} cəhd`} testId="solo-history" />
            <GameList title="Günlük Oyunlar" games={gameHistory.daily_games} sub={(g) => `${g.date} • ${g.attempts?.length || 0} cəhd`} testId="daily-history" />
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedRoom && <RoomDetailModal room={selectedRoom} onClose={() => setSelectedCode(null)} />}
      </AnimatePresence>
    </div>
  );
};

const RoomGrid = ({ rooms, empty, onSelect, showStatus }) => (
  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
    {rooms.length === 0 && <p className="text-white/50 text-center col-span-full py-12">{empty}</p>}
    {rooms.map((room) => (
      <motion.div
        key={room.room_code}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={() => onSelect(room.room_code)}
        data-testid={`room-card-${room.room_code}`}
        className="bg-purple-950/30 hover:bg-purple-950/50 backdrop-blur-md border border-purple-500/20 rounded-2xl p-4 cursor-pointer transition-colors"
      >
        <div className="flex items-start justify-between mb-2">
          <div>
            <h3 className="text-white font-bold text-lg">{room.room_name}</h3>
            <p className="text-xs text-white/50 font-mono">{room.room_code}</p>
          </div>
          <ChevronRight className="w-5 h-5 text-white/40" />
        </div>
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-1 text-white/70">
            <Users className="w-3 h-3" />
            <span>{room.participants?.length || 0}</span>
          </div>
          <div className="text-xs text-white/50">Host: {room.host_name}</div>
        </div>
        {showStatus && (
          <div className="mt-2 inline-block text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/70">{room.status === 'closed' ? 'Bağlı' : 'Aktiv'}</div>
        )}
      </motion.div>
    ))}
  </div>
);

const GameList = ({ title, games, sub, testId }) => (
  <div className="bg-white/5 border border-white/10 rounded-2xl p-4" data-testid={testId}>
    <h3 className="text-white font-bold mb-3">{title} ({games.length})</h3>
    <div className="space-y-2 max-h-[600px] overflow-y-auto">
      {games.length === 0 && <p className="text-white/40 text-sm">Hələ oyun yoxdur</p>}
      {games.slice(0, 50).map((g, i) => (
        <div key={`${g.player_name}-${g.created_at}-${i}`} className="bg-white/5 rounded-lg p-2 text-sm">
          <div className="flex justify-between text-white">
            <span>{g.player_name}</span>
            <span className={g.won ? 'text-green-400' : g.completed ? 'text-red-400' : 'text-white/50'}>
              {g.won ? `${g.points} xal` : g.completed ? 'Uduzdu' : 'Davam edir'}
            </span>
          </div>
          <div className="text-xs text-white/40">{sub(g)}</div>
        </div>
      ))}
    </div>
  </div>
);

const RoomDetailModal = ({ room, onClose }) => {
  const sorted = [...(room.players || [])].sort((a, b) => (b.total_points || 0) - (a.total_points || 0));
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.9 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-900 border border-white/20 rounded-2xl p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto"
        data-testid="room-detail-modal"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-white">{room.room_name}</h2>
            <p className="text-sm text-white/50 font-mono">{room.room_code} • Host: {room.host_name} • Raund: {room.round_number}</p>
          </div>
          <button onClick={onClose} data-testid="modal-close" className="text-white/60 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>
        <h3 className="text-white font-bold mb-3 flex items-center gap-2"><Trophy className="w-5 h-5 text-yellow-400" /> Lider Lövhəsi</h3>
        <div className="space-y-2">
          {sorted.length === 0 && <p className="text-white/40 text-sm">Oyunçu yoxdur</p>}
          {sorted.map((p, i) => (
            <div key={p.player_name} className="bg-white/5 rounded-xl p-3" data-testid={`detail-player-${i}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-white/60 w-6">{i + 1}.</span>
                  <span className="text-white font-semibold">{p.player_name}</span>
                </div>
                <span className="text-yellow-400 font-bold">{p.total_points || 0} xal</span>
              </div>
              <div className="text-xs text-white/40 mt-1">{p.games_won || 0}/{p.games_played || 0} qalib • son raundda {p.current_attempts?.length || 0} cəhd</div>
              {p.current_attempts?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {p.current_attempts.map((a, idx) => (
                    <div key={idx} className="flex gap-0.5">
                      {a.guess.split("").map((ch, j) => (
                        <div key={j} className={`w-5 h-5 flex items-center justify-center text-xs font-bold rounded text-white ${tileColor(a.result[j])}`}>{ch}</div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
};

export default HostPanel;
