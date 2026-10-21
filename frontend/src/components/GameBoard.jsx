import { motion } from "framer-motion";

const getBackgroundColor = (status) => {
  if (status === "correct") return "bg-gradient-to-br from-green-500 to-green-600";
  if (status === "present") return "bg-gradient-to-br from-yellow-400 to-orange-400";
  if (status === "absent") return "bg-gradient-to-br from-gray-600 to-gray-700";
  return "bg-white/10";
};

const getBorderColor = (status) => {
  if (status === "correct") return "border-green-400 shadow-lg shadow-green-500/50";
  if (status === "present") return "border-yellow-400 shadow-lg shadow-yellow-500/50";
  if (status === "absent") return "border-gray-500";
  return "border-white/30";
};

const GameBoard = ({ attempts, currentGuess, maxAttempts }) => {
  const rows = attempts.map((a) => ({ guess: a.guess, result: a.result, isComplete: true }));
  if (attempts.length < maxAttempts) {
    rows.push({ guess: currentGuess, result: [], isComplete: false, isCurrent: true });
  }
  while (rows.length < maxAttempts) {
    rows.push({ guess: "", result: [], isComplete: false, isCurrent: false });
  }

  return (
    <div className="flex flex-col items-center space-y-2" data-testid="game-board">
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className="flex space-x-2">
          {[0, 1, 2, 3, 4].map((colIndex) => {
            const letter = row.guess[colIndex] || "";
            const status = row.result[colIndex] || "";
            const hasLetter = letter !== "";
            return (
              <motion.div
                key={colIndex}
                initial={false}
                animate={{
                  scale: row.isCurrent && hasLetter ? [1, 1.1, 1] : 1,
                  rotateY: row.isComplete ? [0, 180] : 0
                }}
                transition={{
                  scale: { duration: 0.1 },
                  rotateY: { duration: 0.6, delay: colIndex * 0.1 }
                }}
                style={{ transformStyle: "preserve-3d" }}
                className={`w-14 h-14 md:w-16 md:h-16 flex items-center justify-center border-2 rounded-md ${hasLetter ? getBorderColor(status) : 'border-white/30'} ${row.isComplete ? getBackgroundColor(status) : 'bg-transparent'} transition-colors duration-300`}
                data-testid={`tile-${rowIndex}-${colIndex}`}
              >
                <span
                  className="text-2xl md:text-3xl font-bold text-white"
                  style={{ fontFamily: 'JetBrains Mono, monospace', transform: row.isComplete ? 'rotateY(180deg)' : 'none' }}
                >
                  {letter}
                </span>
              </motion.div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default GameBoard;
