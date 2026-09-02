import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Plus, Check, Trash2, BrainCircuit, GripVertical } from "lucide-react";
import { prioritizeTasks } from "../lib/gemini";

interface Task {
  id: string;
  text: string;
  completed: boolean;
}

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [input, setInput] = useState("");
  const [isPrioritizing, setIsPrioritizing] = useState(false);

  const addTask = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim()) return;
    const newTask: Task = {
      id: Math.random().toString(36).substr(2, 9),
      text: input,
      completed: false,
    };
    setTasks([newTask, ...tasks]);
    setInput("");
  };

  const toggleTask = (id: string) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const deleteTask = (id: string) => {
    setTasks(tasks.filter(t => t.id !== id));
  };

  const handlePrioritize = async () => {
    if (tasks.length < 2) return;
    setIsPrioritizing(true);
    const taskTexts = tasks.map(t => t.text);
    const orderedTexts = await prioritizeTasks(taskTexts);
    
    // Sort tasks based on AI response
    const sortedTasks = [...tasks].sort((a, b) => {
      const indexA = orderedTexts.indexOf(a.text);
      const indexB = orderedTexts.indexOf(b.text);
      return (indexA === -1 ? 99 : indexA) - (indexB === -1 ? 99 : indexB);
    });

    setTasks(sortedTasks);
    setIsPrioritizing(false);
  };

  return (
    <div className="bg-white rounded-3xl p-8 shadow-sm border border-black/5 flex flex-col h-full min-h-[400px]">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h3 className="font-serif text-2xl font-semibold italic text-zen-ink">Your Flow</h3>
          <p className="text-xs text-zen-ink/40 font-medium uppercase tracking-wider">Unload your mind</p>
        </div>
        <button 
          onClick={handlePrioritize}
          disabled={tasks.length < 2 || isPrioritizing}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-zen-accent/5 text-zen-accent text-xs font-semibold hover:bg-zen-accent/10 transition-colors disabled:opacity-30"
        >
          <BrainCircuit size={14} className={isPrioritizing ? "animate-pulse" : ""} />
          {isPrioritizing ? "Consulting..." : "AI Prioritize"}
        </button>
      </div>

      <form onSubmit={addTask} className="relative mb-6">
        <input 
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="What's next?"
          className="w-full bg-zen-bg/50 border-none rounded-2xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-zen-accent/20 placeholder:text-zen-ink/20 transition-all outline-none"
        />
        <Plus className="absolute left-4 top-1/2 -translate-y-1/2 text-zen-ink/20" size={20} />
      </form>

      <div className="flex-1 space-y-2 overflow-y-auto max-h-[300px] pr-2 custom-scrollbar">
        <AnimatePresence initial={false}>
          {tasks.map((task) => (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              layout
              className={`group flex items-center gap-3 p-4 rounded-2xl transition-all ${task.completed ? 'bg-zen-bg/30 opacity-60' : 'bg-zen-bg hover:bg-white border border-transparent hover:border-black/5'}`}
            >
              <button 
                onClick={() => toggleTask(task.id)}
                className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors ${task.completed ? 'bg-zen-accent text-white' : 'border-2 border-zen-accent/20 text-transparent hover:border-zen-accent/40'}`}
              >
                <Check size={14} strokeWidth={3} />
              </button>
              
              <span className={`flex-1 text-sm ${task.completed ? 'line-through text-zen-ink/40' : 'text-zen-ink font-medium'}`}>
                {task.text}
              </span>

              <button 
                onClick={() => deleteTask(task.id)}
                className="opacity-0 group-hover:opacity-100 text-zen-ink/20 hover:text-red-400 transition-all"
              >
                <Trash2 size={16} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>

        {tasks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-zen-ink/20 space-y-4">
             <GripVertical size={40} className="rotate-90 opacity-10" />
             <p className="text-sm font-medium italic">Your space is clear.</p>
          </div>
        )}
      </div>
    </div>
  );
}
