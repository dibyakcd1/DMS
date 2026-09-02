import * as React from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usePinAuth } from "@/context/PinAuthContextCore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { Loader2, ArrowLeft, Delete, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Salesperson {
  id: string;
  full_name: string;
  phone: string;
}

export default function PinLogin() {
  const [salespersons, setSalespersons] = React.useState<Salesperson[]>([]);
  const [selectedUser, setSelectedUser] = React.useState<Salesperson | null>(null);
  const [pin, setPin] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [authenticating, setAuthenticating] = React.useState(false);
  const [lockoutTime, setLockoutTime] = React.useState(0);
  const [attempts, setAttempts] = React.useState(0);
  
  const navigate = useNavigate();
  const { pinUser, loginWithPin } = usePinAuth();

  React.useEffect(() => {
    if (pinUser) {
      navigate("/", { replace: true });
    }
  }, [pinUser, navigate]);

  const fetchSalespersons = React.useCallback(async () => {
    setLoading(true);
    try {
      // Prioritize get_salesperson_list as it is the most up-to-date RPC
      const { data, error } = await supabase.rpc('get_salesperson_list');
      
      if (error) {
        console.warn('RPC get_salesperson_list failed, trying fallback...', error);
        // Fallback to get_staff_list_v1 if the first one fails
        const { data: fallbackData, error: fallbackError } = await supabase.rpc('get_staff_list_v1');
        if (fallbackError) throw fallbackError;
        setSalespersons(fallbackData as Salesperson[] || []);
      } else {
        setSalespersons(data as Salesperson[] || []);
      }
    } catch (e: unknown) {
      const error = e as Error;
      console.error('[PinLogin] Failed to fetch staff:', error);
      toast.error("Database Connection Issue", {
        description: error.message || "Could not load staff list. Please ensure database migrations are up to date.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchSalespersons();
  }, [fetchSalespersons]);

  React.useEffect(() => {
    let timer: NodeJS.Timeout;
    if (lockoutTime > 0) {
      timer = setInterval(() => {
        setLockoutTime((prev) => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [lockoutTime]);

  const filteredSalespersons = React.useMemo(() => 
    salespersons.filter(s => s.full_name.toLowerCase().includes(search.toLowerCase())),
    [salespersons, search]
  );

  const handleKeyPress = (num: string) => {
    if (lockoutTime > 0) return;
    if (pin.length < 4) {
      setPin((prev) => prev + num);
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
  };

  const handleSubmit = React.useCallback(async () => {
    if (!selectedUser || pin.length !== 4 || authenticating || lockoutTime > 0) return;

    setAuthenticating(true);
    const result = await loginWithPin(selectedUser.id, pin);

    if (result.success) {
      toast.success("Welcome back", {
        description: `Authenticated as ${selectedUser.full_name}`,
      });
      navigate("/");
    } else {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      setPin("");
      
      if (newAttempts >= 3) {
        setLockoutTime(30);
        setAttempts(0);
        console.error('[Context] Too many login attempts');
        toast.error("Too many attempts", {
          description: "Security lockout for 30 seconds",
        });
      } else {
        console.error('[Context] PIN login incorrect');
        toast.error(friendlyError(result.error || "Incorrect PIN"));
      }
    }
    setAuthenticating(false);
  }, [selectedUser, pin, authenticating, lockoutTime, loginWithPin, navigate, attempts]);

  // Auto-submit when pin reaches 4 digits
  React.useEffect(() => {
    if (pin.length === 4 && selectedUser && !authenticating && lockoutTime === 0) {
      handleSubmit();
    }
  }, [pin, selectedUser, authenticating, lockoutTime, handleSubmit]);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-12">
      <div className="absolute inset-x-0 top-0 -z-10 h-64 bg-brand-gradient opacity-10" />
      
      <Card className="w-full max-w-sm border border-border/60 shadow-xl rounded-[2rem] overflow-hidden animate-fade-in">
        <CardHeader className="text-center pb-2">
          {!selectedUser ? (
            <>
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-gradient shadow-brand">
                 <span className="text-xl font-black text-white">TE</span>
              </div>
              <CardTitle className="text-2xl font-black tracking-tight text-brand-primary">Select your name</CardTitle>
              <CardDescription className="text-xs font-medium">Choose your name to sign in</CardDescription>
            </>
          ) : (
            <div className="flex items-center gap-4 text-left">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-10 w-10 rounded-full" 
                onClick={() => { setSelectedUser(null); setPin(""); }}
              >
                <ArrowLeft size={20} />
              </Button>
              <div>
                <h3 className="font-black text-brand-primary leading-none">{selectedUser.full_name}</h3>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Sales staff</p>
              </div>
            </div>
          )}
        </CardHeader>
        
        <CardContent className="p-6">
          {!selectedUser ? (
            <div className="space-y-4 max-h-[60vh] overflow-y-auto no-scrollbar pt-2">
              <div className="relative group px-1">
                <Input 
                  placeholder="Search your name..." 
                  className="pl-10 h-11 rounded-xl bg-muted/30 border-transparent focus:bg-background transition-all font-bold"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                <Loader2 className={cn("absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground", !loading && "hidden")} />
              </div>

              {filteredSalespersons.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm font-bold text-muted-foreground">No staff found</p>
                  <p className="text-[10px] uppercase font-black tracking-wider opacity-40 mt-1">Ask your admin to set up your PIN</p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-4 h-8 px-4 rounded-lg font-bold text-xs"
                    onClick={fetchSalespersons}
                  >
                    Retry Loading
                  </Button>
                </div>
              ) : (
                filteredSalespersons.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedUser(s)}
                    className="w-full flex items-center justify-between p-4 rounded-2xl bg-muted/30 border border-transparent hover:border-brand-primary/20 hover:bg-muted/50 transition-all group"
                  >
                    <div className="flex items-center gap-4 text-left">
                      <div className="h-10 w-10 rounded-xl bg-brand-primary/10 text-brand-primary font-black flex items-center justify-center uppercase">
                        {s.full_name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-black text-foreground leading-none">{s.full_name}</p>
                      </div>
                    </div>
                  </button>
                ))
              )}
              <div className="pt-4 text-center">
                <Button 
                  variant="link" 
                  className="text-xs font-bold text-muted-foreground/60"
                  onClick={() => navigate('/auth')}
                >
                  Sign in as admin
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="flex justify-center gap-4">
                {[...Array(4)].map((_, i) => (
                  <div 
                    key={i} 
                    className={cn(
                      "h-4 w-4 rounded-full transition-all duration-200",
                      pin.length > i ? "bg-brand-primary scale-110" : "bg-muted-foreground/20"
                    )} 
                  />
                ))}
              </div>

              {lockoutTime > 0 ? (
                <div className="text-center py-8">
                  <p className="text-red-500 font-black text-sm uppercase tracking-widest">Locked</p>
                  <p className="text-4xl font-black tabular-nums mt-2">{lockoutTime}s</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                    <Button 
                      key={n}
                      variant="ghost"
                      className="h-16 rounded-2xl bg-muted/40 text-2xl font-black hover:bg-brand-primary/10 hover:text-brand-primary"
                      onClick={() => handleKeyPress(n.toString())}
                    >
                      {n}
                    </Button>
                  ))}
                  <Button 
                    variant="ghost" 
                    className="h-16 rounded-2xl bg-destructive/5 text-destructive hover:bg-destructive hover:text-white font-black text-2xl"
                    onClick={handleBackspace}
                  >
                    <Delete className="h-7 w-7" />
                  </Button>
                  <Button 
                    variant="ghost"
                    className="h-16 rounded-2xl bg-muted/40 text-2xl font-black hover:bg-brand-primary/10 hover:text-brand-primary"
                    onClick={() => handleKeyPress("0")}
                  >
                    0
                  </Button>
                  <Button 
                    variant="ghost"
                    className={cn(
                      "h-16 rounded-2xl transition-all",
                      pin.length === 4 ? "bg-brand-primary text-white shadow-brand shadow-lg" : "bg-muted/40 text-muted-foreground opacity-50"
                    )}
                    onClick={handleSubmit}
                    disabled={pin.length !== 4 || authenticating}
                  >
                    {authenticating ? <Loader2 className="animate-spin h-6 w-6" /> : <CheckCircle2 size={24} />}
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
