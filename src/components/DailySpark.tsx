import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, RefreshCw } from 'lucide-react';
import { getEngagementTip } from '../services/geminiService';
import Markdown from 'react-markdown';

export default function DailySpark() {
  const [tip, setTip] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const fetchTip = async () => {
    setLoading(true);
    const newTip = await getEngagementTip();
    setTip(newTip);
    setLoading(false);
  };

  useEffect(() => {
    fetchTip();
  }, []);

  return (
    <div className="bg-gradient-to-br from-indigo-600 to-violet-700 p-8 rounded-3xl text-white relative overflow-hidden shadow-md" id="daily-spark-container">
      {/* Background decorations */}
      <div className="absolute top-0 right-0 p-4 opacity-10">
        <Sparkles size={120} />
      </div>
      
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-6">
          <div className="p-2 bg-white/20 rounded-lg">
            <Sparkles className="w-5 h-5 text-indigo-100" />
          </div>
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-100">Daily Spark</span>
        </div>

        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-24 flex items-center"
            >
              <div className="flex gap-2">
                <div className="w-2 h-2 bg-white rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-white rounded-full animate-bounce [animation-delay:0.2s]" />
                <div className="w-2 h-2 bg-white rounded-full animate-bounce [animation-delay:0.4s]" />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="tip"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="min-h-[6rem]"
            >
              <div className="prose prose-invert max-w-none">
                <Markdown>{tip}</Markdown>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <button 
          onClick={fetchTip}
          disabled={loading}
          className="mt-6 flex items-center gap-2 text-sm font-medium text-white/80 hover:text-white transition-colors group"
          id="refresh-tip-btn"
        >
          <RefreshCw className={`w-4 h-4 group-hover:rotate-180 transition-transform duration-500 ${loading ? 'animate-spin' : ''}`} />
          New Inspiration
        </button>
      </div>
    </div>
  );
}
