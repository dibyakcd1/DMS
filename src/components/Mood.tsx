import { useState } from "react";
import { motion } from "motion/react";
import { Smile, Frown, Meh, Sun, CloudRain } from "lucide-react";

const MOODS = [
  { icon: Sun, label: "Radiant", color: "text-orange-400", bg: "bg-orange-50" },
  { icon: Smile, label: "Calm", color: "text-green-400", bg: "bg-green-50" },
  { icon: Meh, label: "Tired", color: "text-slate-400", bg: "bg-slate-50" },
  { icon: Frown, label: "Gloomy", color: "text-indigo-400", bg: "bg-indigo-50" },
  { icon: CloudRain, label: "Anxious", color: "text-rose-400", bg: "bg-rose-50" },
];

export default function Mood() {
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <div className="bg-white rounded-3xl p-8 shadow-sm border border-black/5">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h3 className="font-serif text-2xl font-semibold italic text-zen-ink">How are you?</h3>
          <p className="text-xs text-zen-ink/40 font-medium uppercase tracking-wider">Acknowledge your state</p>
        </div>
        <div className="flex -space-x-1">
           {[...Array(5)].map((_, i) => (
             <div key={i} className={`w-2 h-2 rounded-full border border-white ${i < 3 ? 'bg-zen-accent/40' : 'bg-zen-bg'}`} />
           ))}
        </div>
      </div>

      <div className="flex justify-between gap-2">
        {MOODS.map((mood, idx) => (
          <button
            key={idx}
            onClick={() => setSelected(idx)}
            className={`flex-1 flex flex-col items-center gap-3 p-4 rounded-3xl transition-all ${
              selected === idx 
                ? `${mood.bg} ${mood.color} ring-2 ring-current ring-offset-2` 
                : 'hover:bg-zen-bg grayscale opacity-40 hover:grayscale-0 hover:opacity-100'
            }`}
          >
            <mood.icon size={28} strokeWidth={1.5} />
            <span className="text-[10px] font-bold uppercase tracking-widest">{mood.label}</span>
          </button>
        ))}
      </div>

      <div className="mt-8 pt-8 border-t border-zen-bg">
         <p className="text-xs italic text-zen-ink/40 leading-relaxed">
           "Mood is the climate of the mind. By observing it, we can learn to appreciate every weather pattern without being swept away by the storm."
         </p>
      </div>
    </div>
  );
}
