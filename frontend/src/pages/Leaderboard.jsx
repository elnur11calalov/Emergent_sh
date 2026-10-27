import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, Trophy } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { GoogleButton } from "../components/Auth";
import { useAuth } from "../lib/auth";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const rankStyle = (i) =>
  i === 0 ? "from-yellow-600/40 to-orange-600/30 border-yellow-500/40"
    : i === 1 ? "from-slate-400/30 to-slate-500/20 border-slate-400/40"
    : i === 2 ? "from-amber-700/40 to-amber-600/20 border-amber-600/40"
    : "from-white/5 to-white/5 border-white/10";

const Leaderboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [rows, setRows] = useState(null);

  useEffect(() => {
    axios.get(`${API}/leaderboard/overall`).then((r) => setRows(r.data)).catch(() => toast.error("Cədvəl yüklənmədi"));
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-amber-950/40 to-slate-950 p-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Button data-testid="back-button" onClick={() => navigate("/")} className="bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-full">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Geri
          </Button>
          <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-2" style={{ fontFamily: "Outfit, sans-serif" }}>
            <Trophy className="w-7 h-7 text-yellow-400" /> Ümumi Liderlik
          </h1>
          <div className="w-20" />
        </div>
        <p className="text-white/60 text-sm text-center mb-6">Günlük və Otaq oyunlarında qazanılan bütün xallar toplanır və heç vaxt sıfırlanmır.</p>
        {!user && (
          <div className="flex justify-center mb-6"><GoogleButton label="Daxil ol və cədvələ qoşul" /></div>
        )}
        <div className="space-y-2" data-testid="overall-leaderboard">
          {rows === null && <p className="text-white/50 text-center">Yüklənir...</p>}
          {rows?.length === 0 && <p className="text-white/50 text-center py-8">Hələ heç kim xal qazanmayıb</p>}
          {rows?.map((u, i) => {
            const me = user?.user_id === u.user_id;
            return (
              <motion.div
                key={u.user_id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(i, 15) * 0.03 }}
                className={`flex items-center justify-between rounded-xl px-4 py-3 border bg-gradient-to-r ${rankStyle(i)} ${me ? "ring-2 ring-cyan-400" : ""}`}
                data-testid={`overall-row-${i}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xl font-bold text-white w-8">{i + 1}</span>
                  {u.picture ? (
                    <img src={u.picture} alt="" className="w-9 h-9 rounded-full" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold">{u.nickname[0]}</div>
                  )}
                  <div className="min-w-0">
                    <div className="text-white font-semibold truncate">{u.nickname}{me && <span className="text-cyan-300 text-xs ml-2">(sən)</span>}</div>
                    <div className="text-xs text-white/50">Günlük {u.daily_points || 0} • Otaq {u.room_points || 0}</div>
                  </div>
                </div>
                <div className="text-xl font-bold text-yellow-400">{u.total_points || 0}</div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Leaderboard;
