import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, User, Bot, Sparkles } from 'lucide-react';
import { getAICoachResponse } from '../services/geminiService';
import Markdown from 'react-markdown';
import { Message } from '../types';

export default function AICoach() {
  const [messages, setMessages] = useState<Message[]>([
    { 
      role: 'assistant', 
      content: "Hello! I'm your EngagePulse AI Coach. How can I help you improve your user engagement today?", 
      timestamp: Date.now() 
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: Message = { role: 'user', content: input, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    const response = await getAICoachResponse(input, "Global Engagement Dashboard");
    const assistantMsg: Message = { role: 'assistant', content: response, timestamp: Date.now() };
    
    setMessages(prev => [...prev, assistantMsg]);
    setIsLoading(false);
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden" id="ai-coach-chat">
      {/* Header */}
      <div className="p-6 border-bottom border-gray-100 bg-indigo-50 flex items-center gap-3">
        <div className="p-2 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-200 text-white">
          <Bot size={20} />
        </div>
        <div>
          <h2 className="font-bold text-gray-900">AI Engagement Coach</h2>
          <p className="text-xs text-indigo-600 font-medium">Powered by Gemini Pro</p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth">
        {messages.map((msg, idx) => (
          <motion.div
            key={msg.timestamp}
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`flex gap-3 max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                msg.role === 'user' ? 'bg-indigo-100 text-indigo-600' : 'bg-indigo-600 text-white shadow-md'
              }`}>
                {msg.role === 'user' ? <User size={16} /> : <Sparkles size={16} />}
              </div>
              <div className={`p-4 rounded-2xl text-sm leading-relaxed ${
                msg.role === 'user' 
                  ? 'bg-indigo-600 text-white rounded-tr-none shadow-lg shadow-indigo-100' 
                  : 'bg-indigo-50 text-gray-700 rounded-tl-none border border-indigo-100'
              }`}>
                <div className="prose prose-sm max-w-none prose-indigo">
                  <Markdown>{msg.content}</Markdown>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center animate-pulse">
                <Bot size={16} />
              </div>
              <div className="bg-indigo-50 p-4 rounded-2xl rounded-tl-none border border-indigo-100 flex gap-1">
                <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" />
                <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-6 border-t border-gray-100">
        <div className="relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask for engagement advice..."
            className="w-full bg-slate-50 border border-gray-200 rounded-2xl py-4 pl-6 pr-14 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            id="chat-input"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors disabled:bg-gray-200 disabled:text-gray-400"
            id="send-btn"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
