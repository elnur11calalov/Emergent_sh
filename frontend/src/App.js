import { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import HostPanel from "./pages/HostPanel";
import JoinRoom from "./pages/JoinRoom";
import CreateRoom from "./pages/CreateRoom";
import RoomView from "./pages/RoomView";
import SoloGame from "./pages/SoloGame";
import DailyGame from "./pages/DailyGame";
import { Toaster } from "./components/ui/sonner";
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

function App() {
  useClickSound();
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/host" element={<HostPanel />} />
          <Route path="/join-room" element={<JoinRoom />} />
          <Route path="/create-room" element={<CreateRoom />} />
          <Route path="/room/:roomCode" element={<RoomView />} />
          <Route path="/solo" element={<SoloGame />} />
          <Route path="/daily" element={<DailyGame />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-center" richColors />
    </div>
  );
}

export default App;
