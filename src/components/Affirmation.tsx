import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { getDailyAffirmation } from "../lib/gemini";
import { Sparkles, RefreshCw } from "lucide-react";

export default function Affirmation() {
  const [affirmation, setAffirmation] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const fetchAffirmation = async () => {
    setLoading(true);
    const text = await getDailyAffirmation();
    setAffirmation(text);
    setLoading(false);
  };

  useEffect(() => {
    fetchAffirmation();
  }, []);

  return (
    <div className="bg-white rounded-3xl p-8 shadow-sm border border-black/5 relative overflow-hidden group">
      <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
        <Sparkles size={120} />
      </div>
      
      <div className="relative z-10">
        <span className="text-[10px] uppercase tracking-[0.2em] font-medium text-zen-accent opacity-60 mb-4 block">
          Daily Intention
        </span>
        
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-24 flex items-center"
            >
              <div className="w-8 h-8 border-2 border-zen-accent/20 border-t-zen-accent rounded-full animate-spin" />
            </motion.div>
          ) : (
            <motion.h2
              key="text"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="font-serif italic text-3xl md:text-4xl text-zen-ink leading-tight min-h-[96px]"
            >
              "{affirmation}"
            </motion.h2>
          )}
        </AnimatePresence>

        <button 
          onClick={fetchAffirmation}
          className="mt-6 flex items-center gap-2 text-xs font-medium hover:text-zen-accent transition-colors opacity-40 hover:opacity-100"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh Thought
        </button>
      </div>
    </div>
  );
}
