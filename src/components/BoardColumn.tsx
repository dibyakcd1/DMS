import React, { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Column, Task } from '../types';
import { TaskCard } from './TaskCard';
import { cn } from '../lib/utils';
import { Plus } from 'lucide-react';

interface Props {
  column: Column;
  tasks: Task[];
  onAddTask: (columnId: string, content: string) => void;
}

export const BoardColumn: React.FC<Props> = ({ column, tasks, onAddTask }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newContent, setNewContent] = useState('');

  const { setNodeRef } = useDroppable({
    id: column.id,
    data: {
      type: 'Column',
      column
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;
    onAddTask(column.id, newContent.trim());
    setNewContent('');
    setIsAdding(false);
  };

  return (
    <div className="flex flex-col w-[320px] shrink-0 h-full bg-zinc-50/50 rounded-xl border border-zinc-200 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-zinc-200 flex items-center justify-between bg-white">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold tracking-tight text-zinc-900 uppercase">
            {column.title}
          </h2>
          <span className="px-1.5 py-0.5 text-[10px] font-bold bg-zinc-100 text-zinc-500 rounded-md">
            {tasks.length}
          </span>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="p-1 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-md transition-all"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Task List */}
      <div 
        ref={setNodeRef}
        className="flex-1 p-3 overflow-y-auto space-y-3 min-h-[200px]"
      >
        {isAdding && (
          <form onSubmit={handleSubmit} className="bg-white p-3 border-2 border-zinc-900 rounded-lg shadow-sm">
            <textarea
              autoFocus
              placeholder="What needs to be done?"
              className="w-full text-sm font-medium text-zinc-800 placeholder:text-zinc-300 resize-none outline-none"
              rows={2}
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
                if (e.key === 'Escape') setIsAdding(false);
              }}
            />
            <div className="mt-2 flex items-center justify-end gap-2">
              <button 
                type="button" 
                onClick={() => setIsAdding(false)}
                className="px-2 py-1 text-[10px] font-bold text-zinc-400 hover:text-zinc-600 uppercase tracking-wider"
              >
                Cancel
              </button>
              <button 
                type="submit"
                className="px-2 py-1 bg-zinc-900 text-white text-[10px] font-bold rounded uppercase tracking-wider"
              >
                Create
              </button>
            </div>
          </form>
        )}
        <SortableContext items={column.taskIds} strategy={verticalListSortingStrategy}>
          {tasks.map(task => (
            <TaskCard key={task.id} task={task} />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}
