import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNotifications } from "@/hooks/useNotifications";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fmtDateTime } from "@/lib/format";
import { useNavigate } from "react-router-dom";

export default function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const navigate = useNavigate();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-slate-600 hover:bg-slate-100 relative"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-2 right-2 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 rounded-2xl p-2 border-2 shadow-xl">
        <div className="px-3 py-2 border-b border-border/40 flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Alert Center</h3>
          {unreadCount > 0 && (
            <button 
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                markAllAsRead();
              }}
              className="text-[10px] font-bold text-primary hover:underline transition-all"
            >
              Mark all as read
            </button>
          )}
        </div>
        <div className="max-h-[350px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-xs font-medium text-muted-foreground opacity-50">
              No recent notifications
            </div>
          ) : (
            notifications.map(n => (
              <DropdownMenuItem
                key={n.id}
                className={`flex flex-col items-start p-3 gap-1 rounded-xl cursor-pointer ${!n.read ? 'bg-brand-accent/30' : ''}`}
                onClick={() => {
                  markAsRead(n.id);
                  if (n.related_order_id) navigate(`/orders/${n.related_order_id}`);
                }}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-bold text-[11px] text-foreground">{n.title}</span>
                  <span className="text-[9px] text-muted-foreground">{fmtDateTime(n.created_at)}</span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2">
                  {n.message}
                </p>
                {!n.read && <div className="w-1.5 h-1.5 rounded-full bg-brand-primary mt-1" />}
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
