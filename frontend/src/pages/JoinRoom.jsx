import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const JoinRoom = () => {
  const navigate = useNavigate();
  const [playerName, setPlayerName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [loading, setLoading] = useState(false);

  const handleJoin = async () => {
    if (!playerName.trim() || !roomCode.trim()) {
      toast.error("Zəhmət olmasa bütün xanaları doldurun");
      return;
    }
    setLoading(true);
    try {
      const response = await axios.post(`${API}/rooms/${roomCode}/join`, { room_code: roomCode, player_name: playerName.trim() });
      toast.success(response.data.message);
      navigate(`/room/${roomCode}`, { state: { playerName: playerName.trim(), isHost: false } });
    } catch (error) {
      if (error.response?.status === 404) toast.error("Oda tapılmadı. Kodu yoxlayın.");
      else if (error.response?.status === 410) toast.error("Bu oda bağlanıb");
      else toast.error("Odaya qoşularkən xəta baş verdi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-emerald-950 to-teal-950 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="max-w-md w-full">
        <div className="bg-emerald-950/40 backdrop-blur-md border border-emerald-500/20 rounded-2xl p-8">
          <Button
            data-testid="back-button"
            onClick={() => navigate('/')}
            className="mb-6 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white rounded-full"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Geri
          </Button>
          <h1 className="text-4xl font-bold text-white mb-8 text-center" style={{ fontFamily: 'Outfit, sans-serif' }}>Odaya Qoşul</h1>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-white/70 mb-2 block">Adınız</label>
              <Input
                data-testid="player-name-input"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Adınızı daxil edin"
                className="bg-black/20 border-white/10 text-white text-lg h-14"
              />
            </div>
            <div>
              <label className="text-sm text-white/70 mb-2 block">Oda Kodu</label>
              <Input
                data-testid="room-code-input"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                maxLength={6}
                placeholder="ABC123"
                className="bg-black/20 border-white/10 text-white text-lg h-14 text-center tracking-widest font-bold"
                style={{ fontFamily: 'JetBrains Mono, monospace' }}
              />
            </div>
            <Button
              data-testid="join-button"
              onClick={handleJoin}
              disabled={loading}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white h-14 text-lg rounded-full font-bold shadow-lg"
            >
              {loading ? "Qoşulur..." : "Odaya Qoşul"}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default JoinRoom;
