import { fmtINR } from "@/lib/format";

interface CustomTooltipProps {
  active?: boolean;
  payload?: { color: string; name: string; value: number | string }[];
  label?: string;
}

export const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-4 rounded-2xl shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">{label}</p>
        <div className="space-y-1">
          {payload.map((entry, index: number) => (
            <div key={index} className="flex items-center justify-between gap-8">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="text-xs font-bold text-slate-600">{entry.name}</span>
              </div>
              <span className="text-xs font-black text-slate-900">
                 {typeof entry.value === 'number' && entry.value > 1000 ? fmtINR(Number(entry.value)) : entry.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};
