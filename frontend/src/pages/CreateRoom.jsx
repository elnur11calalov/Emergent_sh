import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { ArrowLeft, Crown } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useAuth } from "../lib/auth";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const HOST_CODE = "Elnur";

const CreateRoom = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [roomName, setRoomName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!roomName.trim()) {
      toast.error("Oda adını daxil edin");
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post(`${API}/rooms/create`, { room_name: roomName.trim(), host_code: HOST_CODE });
      toast.success(`Oda yaradıldı! Kod: ${res.data.room_code}`);
      navigate(`/room/${res.data.room_code}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Oda yaratmaq mümkün olmadı");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-purple-950 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="max-w-md w-full">
        <div className="bg-indigo-950/40 backdrop-blur-md border border-indigo-500/20 rounded-2xl p-8">
          <Button data-testid="back-button" onClick={() => navigate('/')} className="mb-6 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white rounded-full">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Geri
          </Button>
          <div className="flex items-center justify-center mb-2">
            <Crown className="w-10 h-10 text-yellow-400 mr-3" />
            <h1 className="text-3xl md:text-4xl font-bold text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>Oda Qur</h1>
          </div>
          <p className="text-white/60 text-center mb-6" data-testid="host-as">Host: <span className="text-white font-semibold">{user.nickname}</span></p>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-white/70 mb-2 block">Oda Adı</label>
              <Input
                data-testid="room-name-input"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                placeholder="Məs: 5-ci sinif"
                className="bg-black/20 border-white/10 text-white text-lg h-14"
              />
            </div>
            <Button data-testid="create-room-button" onClick={handleCreate} disabled={loading} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-90 text-white h-14 text-lg rounded-full font-bold shadow-lg">
              {loading ? "Yaradılır..." : "Oda Yarat"}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default CreateRoom;
