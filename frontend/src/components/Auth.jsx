import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Lock, ArrowLeft, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useAuth } from "../lib/auth";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const GoogleIcon = () => (
  <svg viewBox="0 0 48 48" className="w-5 h-5" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 38.2 44 33 44 24c0-1.2-.1-2.3-.4-3.5z" />
  </svg>
);

export const GoogleButton = ({ className = "", label = "Google ilə daxil ol", returnPath }) => {
  const { login } = useAuth();
  return (
    <Button
      data-testid="google-login-button"
      onClick={() => login(returnPath)}
      className={`bg-white hover:bg-slate-100 text-slate-800 font-semibold rounded-full shadow-lg gap-2 ${className}`}
    >
      <GoogleIcon />
      {label}
    </Button>
  );
};

export const FullScreenLoader = () => (
  <div className="min-h-screen bg-slate-950 flex items-center justify-center" data-testid="auth-loading">
    <Loader2 className="w-8 h-8 text-white/70 animate-spin" />
  </div>
);

// Exchanges the one-time session_id from the URL fragment for a session cookie
export const AuthCallback = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;
    const sessionId = new URLSearchParams(location.hash.slice(1)).get("session_id");
    const target = sessionStorage.getItem("postLoginPath") || "/";
    sessionStorage.removeItem("postLoginPath");
    axios.post(`${API}/auth/session`, { session_id: sessionId })
      .then(({ data }) => {
        setUser(data);
        navigate(target, { replace: true });
      })
      .catch(() => {
        toast.error("Giriş alınmadı, yenidən cəhd edin");
        navigate("/", { replace: true });
      });
  }, [location.hash, navigate, setUser]);

  return null;
};

export const RequireAuth = ({ children }) => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  if (loading) return <FullScreenLoader />;
  if (user) return children;
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-md w-full bg-indigo-950/40 backdrop-blur-md border border-indigo-500/20 rounded-2xl p-8 text-center" data-testid="login-required">
        <Lock className="w-12 h-12 text-indigo-300 mx-auto mb-4" />
        <h1 className="text-2xl md:text-3xl font-bold text-white mb-2" style={{ fontFamily: "Outfit, sans-serif" }}>Giriş tələb olunur</h1>
        <p className="text-white/70 mb-6">Bu rejimdə oynamaq və xallarını hesabında saxlamaq üçün Google ilə daxil ol.</p>
        <GoogleButton className="w-full h-12" returnPath={location.pathname} />
        <p className="text-white/40 text-sm mt-4">Qonaq kimi yalnız Tək Oyun oynaya bilərsən.</p>
        <Button data-testid="back-button" onClick={() => navigate("/")} className="mt-4 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-full">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Ana səhifə
        </Button>
      </motion.div>
    </div>
  );
};

export const NicknameForm = ({ initial = "", submitLabel = "Yadda saxla", onSaved }) => {
  const { setUser } = useAuth();
  const [nickname, setNickname] = useState(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setError("");
    setSaving(true);
    try {
      const { data } = await axios.put(`${API}/auth/nickname`, { nickname });
      setUser(data);
      toast.success("Ləqəb yadda saxlanıldı");
      onSaved?.(data);
    } catch (e) {
      setError(e.response?.data?.detail || "Xəta baş verdi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <Input
        data-testid="nickname-input"
        value={nickname}
        maxLength={20}
        onChange={(e) => setNickname(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        placeholder="Məs: SözUstası"
        className="bg-black/20 border-white/10 text-white text-lg h-12"
      />
      {error && <p className="text-red-400 text-sm" data-testid="nickname-error">{error}</p>}
      <Button data-testid="nickname-save-button" onClick={save} disabled={saving || nickname.trim().length < 2} className="w-full h-12 bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-90 text-white rounded-full font-bold">
        {saving ? "Yadda saxlanılır..." : submitLabel}
      </Button>
    </div>
  );
};

// Shown once after the first Google sign-in, before anything else
export const NicknameSetup = () => {
  const { user } = useAuth();
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-md w-full bg-indigo-950/40 backdrop-blur-md border border-indigo-500/20 rounded-2xl p-8" data-testid="nickname-setup">
        <h1 className="text-2xl md:text-3xl font-bold text-white mb-2" style={{ fontFamily: "Outfit, sans-serif" }}>Xoş gəldin{user?.name ? `, ${user.name}` : ""}!</h1>
        <p className="text-white/70 mb-6">Oyunda görünəcək ləqəbini seç. Sonra profildən dəyişə bilərsən.</p>
        <NicknameForm submitLabel="Davam et" />
      </motion.div>
    </div>
  );
};
