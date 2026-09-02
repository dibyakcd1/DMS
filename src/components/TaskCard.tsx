import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { Task } from '../types';
import { cn } from '../lib/utils';

interface Props {
  task: Task;
}

export const TaskCard: React.FC<Props> = ({ task }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({
    id: task.id,
    data: {
      type: 'Task',
      task
    }
  });

  const style = {
    transition,
    transform: CSS.Translate.toString(transform),
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative bg-white p-4 border border-zinc-200 rounded-lg shadow-sm hover:border-zinc-400 transition-all cursor-default",
        isDragging && "opacity-50 border-zinc-400 bg-zinc-50 z-50 shadow-lg"
      )}
    >
      <div className="flex items-start gap-2">
        <button
          {...attributes}
          {...listeners}
          className="p-1 -ml-2 text-zinc-300 hover:text-zinc-600 transition-colors cursor-grab active:cursor-grabbing"
        >
          <GripVertical size={16} />
        </button>
        <p className="text-sm font-medium text-zinc-800 leading-tight">
          {task.content}
        </p>
      </div>
      <div className="mt-4 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
          Task ID: {task.id.slice(0, 8)}
        </span>
      </div>
    </div>
  );
}
