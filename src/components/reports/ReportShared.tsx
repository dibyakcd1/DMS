import React from "react";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { 
  ChevronRight, 
  Target, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle,
  Info,
  CheckCircle2,
  Pencil,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";
import { fmtINR } from "@/lib/format";

import { TOKENS, type PeriodType } from "./report-shared-utils";

// --- Components ---

/**
 * 4.4 HeroCard
 */
export const HeroCard = ({ 
  label, 
  amount, 
  columns, 
  tag, 
  color = TOKENS.brand.primary 
}: { 
  label: string; 
  amount: string; 
  columns: { value: string; label: string }[];
  tag?: string;
  color?: string;
}) => (
  <div 
    className="relative rounded-2xl p-5 text-white overflow-hidden mb-2.5"
    style={{ backgroundColor: color }}
  >
    <div className="relative z-10">
      <div className="text-[11px] font-medium opacity-75 mb-1.5 uppercase tracking-wider">{label}</div>
      <div className="text-[30px] font-semibold tracking-tighter mb-3.5 leading-none">{amount}</div>
      
      <div className="flex items-center gap-0.5 justify-between">
        {columns.map((col, i) => (
          <React.Fragment key={i}>
            <div className="flex-1">
              <div className="text-[14px] font-semibold leading-tight">{col.value}</div>
              <div className="text-[9px] font-medium opacity-60 uppercase tracking-widest mt-0.5">{col.label}</div>
            </div>
            {i < columns.length - 1 && <div className="w-px h-6 bg-white/20 mx-2" />}
          </React.Fragment>
        ))}
      </div>

      {tag && (
        <div className="inline-flex items-center gap-1.5 bg-white/15 px-2.5 py-1 rounded-full text-[10px] font-bold mt-3 uppercase tracking-widest backdrop-blur-sm">
          {tag}
        </div>
      )}
    </div>
    
    {/* Subtle circular watermark */}
    <div className="absolute -bottom-8 -right-8 w-[100px] h-[100px] bg-white opacity-[0.06] rounded-full pointer-events-none" />
  </div>
);

/**
 * 4.5 StatCard
 */
export const StatCard = ({ icon: Icon, iconBg, label, value, delta, deltaType }: {
  icon: React.ElementType;
  iconBg: string;
  label: string;
  value: string;
  delta?: string;
  deltaType?: 'up' | 'down';
}) => (
  <div className="bg-white rounded-xl border-[0.5px] border-black/10 p-3 h-full flex flex-col justify-between">
    <div>
      <div 
        className="w-[30px] h-[30px] rounded-lg flex items-center justify-center mb-2"
        style={{ backgroundColor: iconBg }}
      >
        <Icon className="h-3.5 w-3.5 text-slate-600" />
      </div>
      <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-[17px] font-semibold tracking-tight text-slate-900">{value}</div>
    </div>
    {delta && (
      <div className={cn(
        "text-[10px] font-bold mt-1.5 flex items-center gap-0.5",
        deltaType === 'up' ? "text-emerald-600" : "text-red-600"
      )}>
        {deltaType === 'up' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
        {delta}
      </div>
    )}
  </div>
);

/**
 * 4.7 AlertCard
 */
export const AlertCard = ({ title, sub, variant = 'warn', onCta, ctaLabel, icon: Icon }: {
  title: string;
  sub: string;
  variant?: 'warn' | 'danger' | 'info' | 'success';
  onCta?: () => void;
  ctaLabel?: string;
  icon?: React.ElementType;
}) => {
  const styles = {
    warn: "bg-[#fffbeb] border-[#fde68a] text-yellow-800",
    danger: "bg-[#fff1f2] border-[#fecdd3] text-red-800",
    info: "bg-[#eff6ff] border-[#bfdbfe] text-sky-800",
    success: "bg-[#f0fdf4] border-[#bbf7d0] text-emerald-800",
  }[variant];

  return (
    <div className={cn("rounded-xl p-3.5 border-[0.5px] mb-2.5", styles)}>
      <div className="flex items-center gap-2 mb-1.5 px-0.5">
        {Icon ? <Icon className="h-4 w-4" /> : variant === 'warn' ? <AlertTriangle className="h-4 w-4" /> : variant === 'info' ? <Info className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
        <h4 className="text-[13px] font-semibold">{title}</h4>
      </div>
      <p className={cn("text-[11px] font-medium opacity-80 leading-snug mb-3 ml-6", variant === 'warn' ? "text-slate-600" : "")}>{sub}</p>
      {onCta && (
        <button 
          onClick={onCta}
          className="w-full bg-slate-900 bg-opacity-95 text-white text-[11px] font-bold py-2.5 rounded-lg active:scale-95 transition-transform uppercase tracking-widest flex items-center justify-center gap-2"
        >
          {ctaLabel} <ChevronRight className="h-3 w-3" />
        </button>
      )}
    </div>
  );
};

/**
 * 4.12 TargetProgressCard
 */
export const TargetProgressCard = ({ 
  title, 
  current, 
  target, 
  unit = "₹", 
  footer, 
  status, 
  onEdit 
}: {
  title: string;
  current: number;
  target: number;
  unit?: string;
  footer?: string;
  status?: string;
  onEdit?: () => void;
}) => {
  const percent = Math.min(100, (current / target) * 100);
  const colorClass = percent >= 80 ? "bg-[#b45309]" : percent >= 50 ? "bg-[#ca8a04]" : "bg-[#dc2626]";

  return (
    <div className="bg-white rounded-2xl border-[0.5px] border-black/10 p-4 mb-2.5">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-[13px] font-semibold text-slate-800 tracking-tight">{title}</h4>
        {onEdit && (
          <button onClick={onEdit} className="text-[11px] font-bold text-amber-600 flex items-center gap-1 active:opacity-50">
            Edit <Pencil className="h-2.5 w-2.5" />
          </button>
        )}
      </div>
      
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-[22px] font-semibold tracking-tighter text-amber-700">
          {unit === "₹" ? fmtINR(current) : `${current}${unit}`}
        </div>
        <div className="text-[11px] font-medium text-slate-400">
          of {unit === "₹" ? fmtINR(target) : `${target}${unit}`}
        </div>
      </div>

      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden mb-3">
        <motion.div 
          className={cn("h-full rounded-full transition-all", colorClass)}
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="text-[10px] font-medium text-slate-400 capitalize">{footer}</div>
        <div className={cn(
          "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest",
          percent >= 80 ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
        )}>
          {status}
        </div>
      </div>
    </div>
  );
};

/**
 * 4.13 ComparisonTable
 */
export const ComparisonTable = ({ title, rows }: {
  title: string;
  rows: { label: string; current: string; prev: string; delta: string; deltaType: 'up' | 'down' }[];
}) => (
  <div className="bg-white rounded-2xl border-[0.5px] border-black/10 overflow-hidden mb-2.5">
    <div className="bg-slate-50/50 px-4 py-2 border-b border-black/5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{title}</span>
        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Curr / Prev / Δ</span>
      </div>
    </div>
    {rows.map((row, i) => (
      <div key={i} className={cn(
        "flex items-center justify-between px-4 py-2.5 border-b border-black/5 last:border-0",
      )}>
        <div className="text-[12px] font-medium text-slate-600 truncate max-w-[120px]">{row.label}</div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[13px] font-bold text-slate-900 tracking-tight">{row.current}</div>
            <div className="text-[10px] font-medium text-slate-400">{row.prev}</div>
          </div>
          <div className={cn(
            "w-12 text-right text-[10px] font-black uppercase tracking-tighter",
            row.deltaType === 'up' ? "text-emerald-600" : "text-red-600"
          )}>
            {row.deltaType === 'up' ? '▲' : '▼'}{row.delta}
          </div>
        </div>
      </div>
    ))}
  </div>
);

/**
 * 4.14 LeaderboardRow
 */
export const LeaderboardRow = ({ rank, name, value, sub, progress, delta, deltaType, onClick }: {
  rank: number;
  name: string;
  value: string;
  sub: string;
  progress: number;
  delta: string;
  deltaType: 'up' | 'down';
  onClick?: () => void;
}) => {
  const rankColors = [
    "bg-amber-100 text-amber-700",
    "bg-slate-100 text-slate-600",
    "bg-amber-50 text-amber-600"
  ];
  
  return (
    <div 
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 py-3 px-4 border-b border-black/5 last:border-0",
        onClick && "cursor-pointer active:bg-slate-50"
      )}
    >
      <div className={cn(
        "w-7 h-7 rounded-lg flex items-center justify-center font-bold text-[12px] shrink-0",
        rank <= 3 ? rankColors[rank-1] : "bg-slate-50 text-slate-400"
      )}>
        {rank}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <h5 className="text-[13px] font-semibold text-slate-800 truncate">{name}</h5>
          <span className="text-[13px] font-bold text-amber-700 tracking-tight">{value}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-amber-600 rounded-full" style={{ width: `${progress}%` }} />
          </div>
          <div className={cn(
            "text-[9px] font-black uppercase tracking-tighter",
            deltaType === 'up' ? "text-emerald-600" : "text-red-600"
          )}>
            {deltaType === 'up' ? '▲' : '▼'}{delta}
          </div>
        </div>
        <div className="text-[10px] font-medium text-slate-400 mt-1 uppercase tracking-widest">{sub}</div>
      </div>
    </div>
  );
};

/**
 * 4.18 InsightRow
 */
export const InsightRow = ({ type, text, label }: {
  type: 'positive' | 'action_needed' | 'urgent';
  text: string;
  label: string;
}) => {
  const colors = {
    positive: "bg-emerald-500",
    action_needed: "bg-amber-500",
    urgent: "bg-red-500"
  };
  
  const tagColors = {
    positive: "bg-emerald-50 text-emerald-600",
    action_needed: "bg-amber-50 text-amber-600",
    urgent: "bg-red-50 text-red-600"
  };

  return (
    <div className="flex gap-2.5 py-3 border-b border-black/5 last:border-0">
      <div className={cn("w-2 h-2 rounded-full mt-1.5 shrink-0", colors[type])} />
      <div>
        <p className="text-[12px] font-medium leading-relaxed text-slate-700">{text}</p>
        <div className={cn(
          "inline-block px-1.5 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-widest mt-1.5",
          tagColors[type]
        )}>
          {label}
        </div>
      </div>
    </div>
  );
};

/**
 * 4.11 SectionLabel
 */
export const SectionLabel = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("px-1 py-1.5", className)}>
    <h6 className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.1em]">
      {children}
    </h6>
  </div>
);
