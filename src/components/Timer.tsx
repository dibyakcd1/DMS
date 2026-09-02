import { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import { Play, Pause, RotateCcw, Coffee, Brain } from "lucide-react";

export default function Timer() {
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState<"work" | "break">("work");
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const toggleTimer = () => setIsActive(!isActive);

  const resetTimer = () => {
    setIsActive(false);
    setTimeLeft(mode === "work" ? 25 * 60 : 5 * 60);
  };

  const switchMode = (newMode: "work" | "break") => {
    setMode(newMode);
    setIsActive(false);
    setTimeLeft(newMode === "work" ? 25 * 60 : 5 * 60);
  };

  useEffect(() => {
    if (isActive && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      setIsActive(false);
      // Play sound notification here if we had one
      if (timerRef.current) clearInterval(timerRef.current);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, timeLeft]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const progress = mode === "work" 
    ? (timeLeft / (25 * 60)) * 100 
    : (timeLeft / (5 * 60)) * 100;

  return (
    <div className="bg-zen-ink text-white rounded-3xl p-8 shadow-xl relative overflow-hidden">
      <div className="absolute inset-0 opacity-10 pointer-events-none">
         <svg width="100%" height="100%">
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1"/>
            </pattern>
            <rect width="100%" height="100%" fill="url(#grid)" />
         </svg>
      </div>

      <div className="relative z-10 flex flex-col items-center">
        <div className="flex gap-4 mb-8">
          <button 
            onClick={() => switchMode("work")}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-wider transition-all ${mode === "work" ? "bg-white text-zen-ink" : "text-white/40 hover:text-white"}`}
          >
            <Brain size={14} />
            Focus
          </button>
          <button 
            onClick={() => switchMode("break")}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-wider transition-all ${mode === "break" ? "bg-white text-zen-ink" : "text-white/40 hover:text-white"}`}
          >
            <Coffee size={14} />
            Rest
          </button>
        </div>

        <div className="relative w-64 h-64 flex items-center justify-center mb-8">
          <svg className="w-full h-full -rotate-90">
            <circle
              cx="128"
              cy="128"
              r="120"
              stroke="currentColor"
              strokeWidth="8"
              fill="transparent"
              className="text-white/5"
            />
            <motion.circle
              cx="128"
              cy="128"
              r="120"
              stroke="currentColor"
              strokeWidth="8"
              fill="transparent"
              strokeDasharray="754"
              initial={{ strokeDashoffset: 754 }}
              animate={{ strokeDashoffset: 754 - (754 * (100 - progress)) / 100 }}
              className="text-zen-accent"
            />
          </svg>
          <span className="absolute font-mono text-6xl font-light tracking-tighter">
            {formatTime(timeLeft)}
          </span>
        </div>

        <div className="flex gap-4">
          <button 
            onClick={toggleTimer}
            className="w-16 h-16 rounded-full bg-white text-zen-ink flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
          >
            {isActive ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
          </button>
          <button 
            onClick={resetTimer}
            className="w-16 h-16 rounded-full border border-white/20 text-white flex items-center justify-center hover:bg-white/5 active:scale-95 transition-all"
          >
            <RotateCcw size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
