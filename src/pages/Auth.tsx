import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContextCore";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";

export default function Auth() {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [loginSuccess, setLoginSuccess] = React.useState(false);
  const [isSignUp, setIsSignUp] = React.useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  // Redirect if user is already logged in
  React.useEffect(() => {
    if (user || loginSuccess) {
      const timer = setTimeout(() => {
        navigate("/", { replace: true });
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [user, loginSuccess, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || loginSuccess) return;
    setLoading(true);

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: email.split("@")[0],
            },
          },
        });

        if (error) {
          console.error('[Context] Sign up failed', error);
          toast.error(friendlyError(error));
          setLoading(false);
        } else {
          if (data.session) {
            setLoginSuccess(true);
            toast.success("Account created successfully", {
              description: "Identity verified. Redirecting to terminal...",
            });
          } else {
            toast.success("Success", {
              description: "Account created! You can now sign in using your credentials.",
            });
            setIsSignUp(false);
            setLoading(false);
          }
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          console.error('[Context] Login failed', error);
          toast.error(friendlyError(error));
          setLoading(false);
        } else if (data.session) {
          setLoginSuccess(true);
          toast.success("Success", {
            description: "Identity verified. Redirecting to terminal...",
          });
        }
      }
    } catch (error: unknown) {
      console.error("[Context] Authentication error", error);
      toast.error(friendlyError(error));
      setLoading(false);
    }
  };

  if (user || loginSuccess) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="text-center space-y-4 animate-in fade-in zoom-in duration-300">
          <div className="relative mx-auto h-16 w-16">
            <div className="absolute inset-0 rounded-2xl bg-brand-primary opacity-20 animate-ping" />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-gradient shadow-brand">
              <Loader2 className="h-8 w-8 animate-spin text-white" />
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-lg font-black tracking-tight text-foreground">Logged in</p>
            <p className="text-xs font-medium text-muted-foreground animate-pulse tracking-wide uppercase">You're in. Taking you to the dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-transparent px-4 py-12 relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-brand-primary/20 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-brand-secondary/20 rounded-full blur-[120px] animate-pulse delay-700" />
      
      <Card className="w-full max-w-sm border border-white/30 glass-card shadow-2xl transition-all animate-fade-in hover:shadow-brand p-2 rounded-[2.5rem]">
        <CardHeader className="space-y-1 text-center pb-8 pt-8">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-brand-gradient shadow-brand ring-4 ring-white/30 backdrop-blur-sm transform hover:scale-110 transition-transform duration-500">
            <span className="text-2xl font-black tracking-tighter text-white">DMS</span>
          </div>
          <CardTitle className="text-xl font-black uppercase tracking-widest text-brand-primary">
            {isSignUp ? "Create Account" : "DMSv1.0-pro"}
          </CardTitle>
          <CardDescription className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
            {isSignUp ? "Register new credentials" : "Enter terminal credentials"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-medium text-muted-foreground">
                Email *
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="name@tatvishaenterprises.com"
                  className="h-11 pl-10 rounded-xl"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs font-medium text-muted-foreground">
                  Password *
                </Label>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  className="h-11 pl-10 pr-10 rounded-xl"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button 
              className="group h-14 w-full bg-brand-primary font-black uppercase tracking-widest text-xs shadow-xl shadow-brand-primary/20 rounded-2xl active:scale-95 transition-all text-white border-none hover:bg-brand-primary/90" 
              type="submit" 
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isSignUp ? "Creating Account..." : "Verifying Identity..."}
                </>
              ) : isSignUp ? "Create Terminal Account" : "Enter Terminal Now"}
            </Button>
            
            <div className="mt-4 text-center space-y-3">
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="text-xs font-black uppercase tracking-widest text-brand-primary hover:text-brand-primary/80 transition-colors"
                >
                  {isSignUp ? "Already have an account? Sign In" : "Don't have an account? Sign Up"}
                </button>
                
                {!isSignUp && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!email) {
                        toast.error("Required", { description: "Please enter your email first." });
                        return;
                      }
                      const { error } = await supabase.auth.resetPasswordForEmail(email, {
                        redirectTo: `${window.location.origin}/auth?reset=true`,
                      });
                      if (error) {
                        console.error("[Context] Reset password failed", error);
                        toast.error(friendlyError(error));
                      } else {
                        toast.success("Check your email", { description: "Reset link has been sent." });
                      }
                    }}
                    className="text-[10px] uppercase font-black tracking-widest text-muted-foreground/40 hover:text-brand-primary transition-colors"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              
              <p className="text-xs font-medium text-muted-foreground">For DMSv1.0-pro staff only</p>
              <button
                type="button"
                onClick={() => navigate('/pin-login')}
                className="text-xs text-brand-primary/60 hover:text-brand-primary underline underline-offset-2 transition-colors"
              >
                Sales staff sign in with PIN
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
