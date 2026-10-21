import { Button } from "./ui/button";
import { Delete } from "lucide-react";
import { motion } from "framer-motion";

const keyboardLayout = [
  ["Q", "Ü", "E", "R", "T", "Y", "U", "İ", "O", "P", "Ö", "Ğ"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L", "I", "Ə"],
  ["Z", "X", "C", "V", "B", "N", "M", "Ç", "Ş"]
];

const AzerbaijaniKeyboard = ({ onKeyPress, usedLetters = {} }) => {
  const getKeyColor = (key) => {
    const status = usedLetters[key];
    if (status === "correct") return "bg-green-600 hover:bg-green-700 border-green-500";
    if (status === "present") return "bg-yellow-500 hover:bg-yellow-600 border-yellow-400";
    if (status === "absent") return "bg-gray-600 hover:bg-gray-700 border-gray-500";
    return "bg-white/10 hover:bg-white/20 border-white/20";
  };

  return (
    <div className="flex flex-col items-center space-y-1 md:space-y-2 w-full max-w-3xl mx-auto px-1" data-testid="keyboard">
      {keyboardLayout.map((row, rowIndex) => (
        <div key={rowIndex} className="flex justify-center space-x-0.5 md:space-x-2 w-full">
          {rowIndex === 2 && (
            <Button
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              data-testid="key-enter"
              onClick={() => onKeyPress("ENTER")}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-1.5 md:px-4 h-10 md:h-14 text-xs md:text-sm rounded-md border border-emerald-500"
            >
              ENTER
            </Button>
          )}
          {row.map((key) => (
            <motion.div key={key} whileTap={{ scale: 0.95 }}>
              <Button
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
                data-testid={`key-${key}`}
                onClick={() => onKeyPress(key)}
                className={`${getKeyColor(key)} text-white font-bold w-6 h-10 md:w-10 md:h-14 text-xs md:text-lg rounded-md border transition-colors p-0`}
                style={{ fontFamily: 'JetBrains Mono, monospace' }}
              >
                {key}
              </Button>
            </motion.div>
          ))}
          {rowIndex === 2 && (
            <Button
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              data-testid="key-backspace"
              onClick={() => onKeyPress("BACKSPACE")}
              className="bg-red-600 hover:bg-red-700 text-white font-bold px-1.5 md:px-4 h-10 md:h-14 rounded-md border border-red-500"
            >
              <Delete className="w-4 h-4 md:w-5 md:h-5" />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
};

export default AzerbaijaniKeyboard;
