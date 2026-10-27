import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, Trophy, Calendar, Users, User, LogOut, Pencil, X } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { NicknameForm } from "../components/Auth";
import { useAuth } from "../lib/auth";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const MODES = {
  daily: { label: "Günlük", icon: Calendar, color: "text-orange-400" },
  room: { label: "Otaq", icon: Users, color: "text-emerald-400" },
  solo: { label: "Tək", icon: User, color: "text-cyan-400" },
};

const StatCard = ({ mode, stats }) => {
  const m = MODES[mode];
  const rate = stats.played ? Math.round((stats.won / stats.played) * 100) : 0;
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4" data-testid={`stats-${mode}`}>
      <div className={`flex items-center gap-2 mb-3 font-semibold ${m.color}`}><m.icon className="w-4 h-4" />{m.label}</div>
      <div className="grid grid-cols-3 text-center">
        <div><div className="text-2xl font-bold text-white">{stats.played}</div><div className="text-xs text-white/50">Oyun</div></div>
        <div><div className="text-2xl font-bold text-white">{stats.won}</div><div className="text-xs text-white/50">Qələbə</div></div>
        <div><div className="text-2xl font-bold text-white">{rate}%</div><div className="text-xs text-white/50">Uğur</div></div>
      </div>
    </div>
  );
};

const Distribution = ({ distribution }) => {
  const max = Math.max(1, ...Object.values(distribution));
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4" data-testid="guess-distribution">
      <h3 className="text-white font-bold mb-3">Neçənci cəhddə tapdın</h3>
      <div className="space-y-1.5">
        {Object.entries(distribution).map(([n, count]) => (
          <div key={n} className="flex items-center gap-2">
            <span className="w-4 text-white/70 text-sm font-mono">{n}</span>
            <motion.div initial={{ width: 0 }} animate={{ width: `${Math.max(8, (count / max) * 100)}%` }} className={`h-6 rounded flex items-center justify-end px-2 text-xs font-bold text-white ${count ? "bg-gradient-to-r from-green-600 to-emerald-500" : "bg-white/10"}`}>
              {count}
            </motion.div>
          </div>
        ))}
      </div>
    </div>
  );
};

const RecentGames = ({ recent }) => (
  <div className="bg-white/5 border border-white/10 rounded-2xl p-4" data-testid="recent-games">
    <h3 className="text-white font-bold mb-3">Son oyunlar</h3>
    {recent.length === 0 && <p className="text-white/40 text-sm">Hələ oyun yoxdur</p>}
    <div className="space-y-2">
      {recent.map((g, i) => {
        const m = MODES[g.mode];
        return (
          <div key={`${g.date}-${i}`} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2 text-sm">
            <div className="flex items-center gap-2">
              <m.icon className={`w-4 h-4 ${m.color}`} />
              <span className="text-white">{m.label}{g.room_name ? ` • ${g.room_name}` : ""}</span>
              <span className="text-white/40 text-xs">{new Date(g.date).toLocaleDateString("az-AZ")}</span>
            </div>
            <span className={g.won ? "text-green-400 font-semibold" : "text-red-400"}>
              {g.won ? `${g.attempts}. cəhd${g.points ? ` • +${g.points}` : ""}` : "Uduzdu"}
            </span>
          </div>
        );
      })}
    </div>
  </div>
);

const Profile = () => {
  const navigate = useNavigate();
  const { user, logout, refresh } = useAuth();
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    axios.get(`${API}/profile/me`).then((r) => setData(r.data)).catch(() => toast.error("Profil yüklənmədi"));
  }, [user]);

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Button data-testid="back-button" onClick={() => navigate("/")} className="bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-full">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Ana səhifə
          </Button>
          <Button data-testid="logout-button" onClick={handleLogout} className="bg-white/10 hover:bg-red-600/60 border border-white/20 text-white rounded-full">
            <LogOut className="w-4 h-4 mr-2" />
            Çıxış
          </Button>
        </div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-indigo-950/40 backdrop-blur-md border border-indigo-500/20 rounded-2xl p-6 mb-4 flex flex-col md:flex-row md:items-center gap-6">
          {user.picture ? (
            <img src={user.picture} alt="" className="w-20 h-20 rounded-full border-4 border-white/20" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-indigo-600 flex items-center justify-center text-3xl font-bold text-white">{user.nickname?.[0]}</div>
          )}
          <div className="flex-1">
            {editing ? (
              <div className="max-w-sm">
                <NicknameForm initial={user.nickname} onSaved={() => setEditing(false)} />
                <button onClick={() => setEditing(false)} className="text-white/50 text-sm mt-2 flex items-center gap-1" data-testid="nickname-cancel"><X className="w-3 h-3" />Ləğv et</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-3xl md:text-4xl font-bold text-white" style={{ fontFamily: "Outfit, sans-serif" }} data-testid="profile-nickname">{user.nickname}</h1>
                <button onClick={() => setEditing(true)} data-testid="edit-nickname-button" className="text-white/50 hover:text-white"><Pencil className="w-4 h-4" /></button>
              </div>
            )}
            <p className="text-white/50 text-sm mt-1">{user.email}</p>
          </div>
          <div className="text-left md:text-right">
            <div className="text-white/60 text-sm">Ümumi xal</div>
            <div className="text-4xl font-bold text-yellow-400" data-testid="profile-total-points">{user.total_points}</div>
            {data && <div className="text-white/60 text-sm" data-testid="profile-rank">Reytinq: #{data.rank}</div>}
          </div>
        </motion.div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-orange-950/30 border border-orange-500/20 rounded-2xl p-4">
            <div className="text-white/60 text-sm">Günlük oyun xalları</div>
            <div className="text-2xl font-bold text-white" data-testid="profile-daily-points">{user.daily_points}</div>
          </div>
          <div className="bg-emerald-950/30 border border-emerald-500/20 rounded-2xl p-4">
            <div className="text-white/60 text-sm">Otaq oyunu xalları</div>
            <div className="text-2xl font-bold text-white" data-testid="profile-room-points">{user.room_points}</div>
          </div>
        </div>

        {data ? (
          <div className="space-y-4">
            <div className="grid md:grid-cols-3 gap-4">
              <StatCard mode="daily" stats={data.daily} />
              <StatCard mode="room" stats={data.room} />
              <StatCard mode="solo" stats={data.solo} />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <Distribution distribution={data.distribution} />
              <RecentGames recent={data.recent} />
            </div>
          </div>
        ) : (
          <p className="text-white/50 text-center py-8">Yüklənir...</p>
        )}
        <Button data-testid="open-leaderboard-button" onClick={() => navigate("/leaderboard")} className="mt-6 w-full bg-gradient-to-r from-yellow-600 to-orange-600 hover:opacity-90 text-white rounded-full h-12 font-bold">
          <Trophy className="w-5 h-5 mr-2" />
          Ümumi Liderlik Cədvəli
        </Button>
      </div>
    </div>
  );
};

export default Profile;
