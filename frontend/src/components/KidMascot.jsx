import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

// Mood → default speech bubble text
const MESSAGES = {
  wave: "Salam! Gəl oynayaq!",
  idle: "Sən bacararsan!",
  happy: "Əla! Düz hərf tapdın!",
  sad: "Eybi yox, yenə cəhd et!",
  win: "Yaşa! Qalib gəldin!",
  lose: "Növbəti dəfə alınacaq!",
};

const TRANSIENT = ["happy", "sad"];

// Hook: pages call react() after every guess, reset() on new game
export const useKidMood = (baseMood = "idle") => {
  const [mood, setMood] = useState(baseMood);
  const timer = useRef(null);

  const setTemp = useCallback((m) => {
    clearTimeout(timer.current);
    setMood(m);
    if (TRANSIENT.includes(m)) {
      timer.current = setTimeout(() => setMood(baseMood), 2800);
    }
  }, [baseMood]);

  const react = useCallback((result, won, completed) => {
    if (won) return setTemp("win");
    if (completed) return setTemp("lose");
    const good = result.some((r) => r === "correct" || r === "present");
    setTemp(good ? "happy" : "sad");
  }, [setTemp]);

  const reset = useCallback(() => {
    clearTimeout(timer.current);
    setMood(baseMood);
  }, [baseMood]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return { mood, react, reset };
};

const bodyAnim = {
  wave: { y: [0, -3, 0], transition: { duration: 2, repeat: Infinity } },
  idle: { y: [0, -3, 0], transition: { duration: 2.4, repeat: Infinity } },
  happy: { y: [0, -14, 0, -8, 0], transition: { duration: 0.9 } },
  sad: { y: 4, rotate: -3, transition: { duration: 0.4 } },
  win: { y: [0, -26, 0], transition: { duration: 0.6, repeat: Infinity } },
  lose: { y: 6, rotate: 0, transition: { duration: 0.5 } },
};

const armAnim = (side, mood) => {
  const s = side === "left" ? 1 : -1;
  if (mood === "wave" && side === "right") return { rotate: [-140, -110, -140], transition: { duration: 0.6, repeat: Infinity } };
  if (mood === "happy" || mood === "win") return { rotate: 150 * s * -1, transition: { duration: 0.3 } };
  if (mood === "sad" || mood === "lose") return { rotate: 8 * s, transition: { duration: 0.4 } };
  return { rotate: 18 * s, transition: { duration: 0.4 } };
};

const Mouth = ({ mood }) => {
  if (mood === "win") return <path d="M47 70 Q60 88 73 70 Z" fill="#7a2e1f" />;
  if (mood === "happy" || mood === "wave") return <path d="M48 71 Q60 83 72 71" stroke="#7a2e1f" strokeWidth="3" fill="none" strokeLinecap="round" />;
  if (mood === "sad" || mood === "lose") return <path d="M50 79 Q60 70 70 79" stroke="#7a2e1f" strokeWidth="3" fill="none" strokeLinecap="round" />;
  return <path d="M51 73 Q60 79 69 73" stroke="#7a2e1f" strokeWidth="3" fill="none" strokeLinecap="round" />;
};

const Eyes = ({ mood }) => {
  if (mood === "win") {
    return (
      <g stroke="#2b1d16" strokeWidth="3" fill="none" strokeLinecap="round">
        <path d="M42 58 Q47 52 52 58" />
        <path d="M68 58 Q73 52 78 58" />
      </g>
    );
  }
  const sad = mood === "sad" || mood === "lose";
  return (
    <g>
      {sad && (
        <g stroke="#2b1d16" strokeWidth="2.5" strokeLinecap="round">
          <line x1="40" y1="50" x2="52" y2="46" />
          <line x1="80" y1="50" x2="68" y2="46" />
        </g>
      )}
      <motion.g
        animate={{ scaleY: [1, 1, 0.1, 1] }}
        transition={{ duration: 3.5, repeat: Infinity, times: [0, 0.9, 0.95, 1] }}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      >
        <ellipse cx="47" cy="58" rx="4" ry="5" fill="#2b1d16" />
        <ellipse cx="73" cy="58" rx="4" ry="5" fill="#2b1d16" />
        <circle cx="48.5" cy="56" r="1.4" fill="#fff" />
        <circle cx="74.5" cy="56" r="1.4" fill="#fff" />
      </motion.g>
    </g>
  );
};

const Tears = () => (
  <g>
    {[47, 73].map((x, i) => (
      <motion.ellipse
        key={x}
        cx={x}
        cy="66"
        rx="2.2"
        ry="3.2"
        fill="#60a5fa"
        animate={{ cy: [64, 80], opacity: [1, 0] }}
        transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.5 }}
      />
    ))}
  </g>
);

const Stars = () => (
  <g fill="#facc15">
    {[[12, 30], [104, 24], [16, 90], [106, 84]].map(([x, y], i) => (
      <motion.path
        key={i}
        d={`M${x} ${y - 6} L${x + 2} ${y - 2} L${x + 6} ${y} L${x + 2} ${y + 2} L${x} ${y + 6} L${x - 2} ${y + 2} L${x - 6} ${y} L${x - 2} ${y - 2} Z`}
        animate={{ scale: [0.4, 1.2, 0.4], opacity: [0.3, 1, 0.3] }}
        transition={{ duration: 1, repeat: Infinity, delay: i * 0.25 }}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      />
    ))}
  </g>
);

const Arm = ({ side, mood }) => {
  const x = side === "left" ? 34 : 86;
  return (
    <motion.g
      animate={armAnim(side, mood)}
      style={{ transformBox: "fill-box", transformOrigin: "top center" }}
    >
      <rect x={x - 5} y="94" width="10" height="30" rx="5" fill="#2563eb" />
      <circle cx={x} cy="126" r="6" fill="#ffd7b5" />
    </motion.g>
  );
};

export const KidMascot = ({ mood = "idle", message }) => {
  const text = message ?? MESSAGES[mood];
  return (
    <div
      className="fixed bottom-3 left-3 z-40 pointer-events-none select-none flex flex-col items-start"
      data-testid="kid-mascot"
      data-mood={mood}
    >
      <AnimatePresence mode="wait">
        {text && (
          <motion.div
            key={text}
            initial={{ opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4 }}
            className="relative mb-1 ml-2 max-w-[170px] rounded-2xl bg-white px-3 py-1.5 text-xs md:text-sm font-semibold text-slate-800 shadow-lg"
            style={{ fontFamily: "Manrope, sans-serif" }}
            data-testid="kid-mascot-message"
          >
            {text}
            <span className="absolute -bottom-1.5 left-6 h-3 w-3 rotate-45 bg-white" />
          </motion.div>
        )}
      </AnimatePresence>
      <motion.svg
        viewBox="0 0 120 170"
        className="w-16 md:w-24 drop-shadow-xl"
        animate={bodyAnim[mood] || bodyAnim.idle}
      >
        {mood === "win" && <Stars />}
        {/* Backpack */}
        <rect x="30" y="90" width="60" height="46" rx="12" fill="#f97316" />
        {/* Legs */}
        <rect x="45" y="134" width="11" height="26" rx="5" fill="#1e293b" />
        <rect x="64" y="134" width="11" height="26" rx="5" fill="#1e293b" />
        <ellipse cx="50" cy="162" rx="9" ry="5" fill="#ef4444" />
        <ellipse cx="70" cy="162" rx="9" ry="5" fill="#ef4444" />
        {/* Arms (behind body) */}
        <Arm side="left" mood={mood} />
        <Arm side="right" mood={mood} />
        {/* Body */}
        <rect x="38" y="88" width="44" height="50" rx="14" fill="#3b82f6" />
        <rect x="54" y="88" width="12" height="10" rx="3" fill="#fff" />
        {/* Head */}
        <circle cx="60" cy="58" r="30" fill="#ffd7b5" />
        <path d="M30 54 Q32 24 60 24 Q90 24 90 54 Q84 38 70 36 Q64 44 50 40 Q38 42 30 54 Z" fill="#3b2314" />
        <circle cx="40" cy="68" r="5" fill="#fda4af" opacity="0.7" />
        <circle cx="80" cy="68" r="5" fill="#fda4af" opacity="0.7" />
        <Eyes mood={mood} />
        <Mouth mood={mood} />
        {mood === "lose" && <Tears />}
      </motion.svg>
    </div>
  );
};
