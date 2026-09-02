import React from 'react';
import { motion } from 'motion/react';
import { LayoutDashboard, MessageSquare, BarChart3, Settings, Zap, Users, LogOut } from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export default function Sidebar({ activeTab, setActiveTab }: SidebarProps) {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'coach', label: 'AI Coach', icon: MessageSquare },
    { id: 'insights', label: 'Insights', icon: BarChart3 },
    { id: 'users', label: 'User Segments', icon: Users },
  ];

  return (
    <div className="w-64 h-screen bg-slate-900 text-slate-300 flex flex-col fixed left-0 top-0 border-r border-slate-800" id="sidebar">
      <div className="p-8 flex items-center gap-3">
        <div className="p-2 bg-indigo-500 rounded-xl">
          <Zap className="w-6 h-6 text-white fill-current" />
        </div>
        <h1 className="text-xl font-bold text-white tracking-tight">EngagePulse</h1>
      </div>

      <nav className="flex-1 px-4 py-8">
        <ul className="space-y-2">
          {menuItems.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  activeTab === item.id
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                    : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
                id={`nav-${item.id}`}
              >
                <item.icon size={20} />
                <span className="font-medium">{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="p-6 border-t border-slate-800">
        <button className="flex items-center gap-3 px-4 py-3 w-full text-slate-400 hover:text-rose-400 transition-colors">
          <LogOut size={20} />
          <span className="font-medium">Sign Out</span>
        </button>
      </div>
    </div>
  );
}
