import { useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import Home from "./pages/Home";
import HostPanel from "./pages/HostPanel";
import JoinRoom from "./pages/JoinRoom";
import CreateRoom from "./pages/CreateRoom";
import RoomView from "./pages/RoomView";
import SoloGame from "./pages/SoloGame";
import DailyGame from "./pages/DailyGame";
import Profile from "./pages/Profile";
import Leaderboard from "./pages/Leaderboard";
import { Toaster } from "./components/ui/sonner";
import { AuthCallback, NicknameSetup, RequireAuth } from "./components/Auth";
import { AuthProvider, useAuth } from "./lib/auth";
import { playSound } from "./lib/sounds";
import "@/App.css";

// One click sound for every button and mode card; game keys have their own sounds
const useClickSound = () => {
  useEffect(() => {
    const onClick = (e) => {
      const el = e.target.closest("button, [data-testid$='-card']");
      if (el && !el.dataset.testid?.startsWith("key-")) playSound("click");
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
};

const guarded = (el) => <RequireAuth>{el}</RequireAuth>;

const AppRouter = () => {
  const location = useLocation();
  const { user } = useAuth();
  // Detect the OAuth fragment during render so it is handled before anything else
  if (location.hash?.includes("session_id=")) return <AuthCallback />;
  if (user && !user.nickname) return <NicknameSetup />;
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/solo" element={<SoloGame />} />
      <Route path="/leaderboard" element={<Leaderboard />} />
      <Route path="/daily" element={guarded(<DailyGame />)} />
      <Route path="/join-room" element={guarded(<JoinRoom />)} />
      <Route path="/create-room" element={guarded(<CreateRoom />)} />
      <Route path="/room/:roomCode" element={guarded(<RoomView />)} />
      <Route path="/host" element={guarded(<HostPanel />)} />
      <Route path="/profile" element={guarded(<Profile />)} />
    </Routes>
  );
};

function App() {
  useClickSound();
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <AppRouter />
        </BrowserRouter>
      </AuthProvider>
      <Toaster position="top-center" richColors />
    </div>
  );
}

export default App;
