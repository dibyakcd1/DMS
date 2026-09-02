import * as React from "react";
import { usePrinter } from "@/printer/PrinterContextCore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "motion/react";
import { 
  Printer, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  RotateCcw,
  Bluetooth, 
  Info,
  Check,
  Power,
  Zap,
  XCircle,
  Smartphone
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function PrinterSettings() {
  const { 
    state, 
    errorReason, 
    connectedDevice, 
    discoveredDevices,
    scan, 
    connect,
    disconnect, 
    print 
  } = usePrinter();
  
  const [isTesting, setIsTesting] = React.useState(false);

  const handleTestPrint = async () => {
    if (state !== 'connected') {
      toast.error("Not connected");
      return;
    }

    try {
      setIsTesting(true);
      const encoder = new TextEncoder();
      
      const data = new Uint8Array([
        0x1B, 0x40, // Initialize
        0x1B, 0x61, 0x01, // Center
        0x1D, 0x21, 0x11, // Double size
        ...encoder.encode("TATVISHA\n"),
        0x1D, 0x21, 0x00, // Reset size
        ...encoder.encode("--------------------------------\n"),
        ...encoder.encode(`TEST PRINT: SUCCESS\n`),
        ...encoder.encode(`DATE: ${new Date().toLocaleString()}\n`),
        ...encoder.encode("--------------------------------\n"),
        ...encoder.encode("\n\n\n\n"),
        0x1D, 0x56, 0x42, 0x00 // Cut
      ]);
      
      await print(data);
      toast.success("Test print sent");
    } catch (error) {
      console.error(error);
      toast.error("Print failed", { 
        description: error instanceof Error ? error.message : "Printer not reachable"
      });
    } finally {
      setIsTesting(false);
    }
  };

  const steps = [
    { id: 1, label: "Turn on printer", desc: "Ensure Bluetooth is enabled", active: true, completed: state === 'connected' || state === 'connecting' || state === 'scanning' },
    { id: 2, label: "Scan & Connect", desc: "Choose BLE or classic printer", active: state === 'disconnected' || state === 'scanning' || state === 'connecting', completed: state === 'connected' },
    { id: 3, label: "Test Print", desc: "Verify connection works", active: state === 'connected', completed: false }
  ];

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      <Card className="border border-slate-100 shadow-sm rounded-2xl overflow-hidden bg-white">
        <CardHeader className="border-b bg-slate-50/50 p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4">
            <div className="space-y-0.5">
              <CardTitle className="text-lg sm:text-xl font-bold text-slate-900">Printer Setup</CardTitle>
              <CardDescription className="text-xs sm:text-sm font-medium text-slate-500">Connect your Bluetooth thermal printer for billing</CardDescription>
            </div>
            <div className="flex items-center self-start sm:self-center gap-2">
              <Badge variant="secondary" className={cn(
                "h-7 px-3 font-bold uppercase text-[10px] tracking-wider border-none",
                state === 'connected' ? "bg-emerald-100 text-emerald-700" :
                state === 'scanning' || state === 'connecting' ? "bg-blue-100 text-blue-700" :
                state === 'error' ? "bg-rose-100 text-rose-700" :
                "bg-slate-100 text-slate-500"
              )}>
                <span className={cn("mr-1.5 h-1.5 w-1.5 rounded-full", 
                  state === 'connected' ? "bg-emerald-500 animate-pulse" :
                  state === 'scanning' || state === 'connecting' ? "bg-blue-500 animate-pulse" :
                  state === 'error' ? "bg-rose-500" : "bg-slate-400"
                )} />
                {state === 'connected' ? 'Connected' : 
                 state === 'scanning' ? 'Scanning...' : 
                 state === 'connecting' ? 'Linking...' : 
                 state === 'error' ? 'Error' : 'Offline'}
              </Badge>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-0">
          {/* Step Guide */}
          <div className="p-4 sm:p-5 border-b bg-white">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-6">
              {steps.map((step) => (
                <div key={step.id} className="flex items-start gap-3">
                  <div className={cn(
                    "h-7 w-7 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 border-2 mt-0.5",
                    step.completed ? "bg-emerald-500 border-emerald-500 text-white" :
                    step.active ? "border-primary text-primary" : "border-slate-200 text-slate-300"
                  )}>
                    {step.completed ? <Check className="h-4 w-4" /> : <span className="text-xs font-bold">{step.id}</span>}
                  </div>
                  <div className="space-y-0.5 min-w-0">
                    <p className={cn("text-xs font-bold uppercase tracking-tight truncate", 
                      step.completed ? "text-slate-900" : step.active ? "text-primary" : "text-slate-500"
                    )}>{step.label}</p>
                    <p className="text-[11px] font-medium text-slate-400 leading-snug">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action Area */}
          <div className="p-4 sm:p-5 flex flex-col gap-4">
            <AnimatePresence mode="wait">
              {state === 'error' && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }} 
                  animate={{ opacity: 1, y: 0 }}
                  className="w-full p-3.5 sm:p-4 rounded-xl bg-rose-50 border border-rose-100 flex items-start gap-3"
                >
                  <XCircle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
                  <div className="space-y-1 min-w-0">
                    <p className="text-sm font-bold text-rose-900">Could not connect</p>
                    <p className="text-xs font-medium text-rose-700/70">{errorReason || "Peripheral rejected the connection sequence."}</p>
                  </div>
                </motion.div>
              )}

              {state === 'connected' && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }} 
                  animate={{ opacity: 1, scale: 1 }}
                  className="w-full p-3.5 sm:p-4 rounded-xl bg-emerald-50 border border-emerald-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-full bg-white flex items-center justify-center text-emerald-600 shadow-sm shrink-0">
                      <Bluetooth className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-emerald-900/70 uppercase tracking-wider">Device Linked</p>
                      <p className="text-sm font-bold text-emerald-700 break-words">{connectedDevice?.name}</p>
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => disconnect()}
                    className="h-9 px-4 rounded-lg text-emerald-700 hover:bg-emerald-100 font-bold uppercase text-[10px] tracking-widest shrink-0 self-end sm:self-auto"
                  >
                    Disconnect
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>

            {state !== 'connected' && discoveredDevices && discoveredDevices.length > 0 && (
              <div className="w-full space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-black uppercase tracking-widest text-slate-500">Available printers</p>
                  <Badge variant="secondary" className="rounded-md text-[10px] font-bold">
                    {discoveredDevices.length}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {discoveredDevices.map((device) => (
                    <Button
                      key={`${device.protocol || 'bt'}-${device.id || device.address || device.name}`}
                      variant="outline"
                      onClick={() => connect(device)}
                      disabled={state === 'connecting' || state === 'scanning'}
                      className="h-auto min-h-14 w-full justify-between rounded-xl border-slate-200 px-4 py-3 text-left"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <Bluetooth className="h-5 w-5 shrink-0 text-primary" />
                        <span className="min-w-0">
                          <span className="block text-sm font-black text-slate-900 break-words">{device.name}</span>
                          <span className="block text-[11px] font-semibold text-slate-400 break-words">
                            {device.protocol === 'classic' ? 'Classic SPP' : 'BLE'}
                            {device.paired ? ' • Paired' : ''}
                            {device.address ? ` • ${device.address}` : ''}
                          </span>
                        </span>
                      </span>
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-slate-300" />
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="w-full flex flex-col sm:flex-row gap-4">
              {state !== 'connected' ? (
                <Button 
                  onClick={() => scan()}
                  disabled={state === 'scanning' || state === 'connecting'}
                  className="w-full h-11 rounded-xl font-bold uppercase tracking-widest text-xs shadow-md transition-all active:scale-[0.98]"
                >
                  {state === 'scanning' ? (
                    <><RefreshCw className="mr-3 h-4 w-4 animate-spin" /> Scanning...</>
                  ) : state === 'connecting' ? (
                    <><RefreshCw className="mr-3 h-4 w-4 animate-spin" /> Linking...</>
                  ) : "Scan & Connect"}
                </Button>
              ) : (
                <Button 
                  onClick={handleTestPrint}
                  disabled={isTesting}
                  variant="outline"
                  className="w-full h-11 rounded-xl font-bold uppercase tracking-widest text-xs border-2 border-slate-200 hover:bg-slate-50 transition-all active:scale-[0.98]"
                >
                  {isTesting ? <RefreshCw className="mr-3 h-4 w-4 animate-spin text-primary" /> : <Printer className="mr-3 h-4 w-4 text-primary" />}
                  Test Print
                </Button>
              )}
            </div>
          </div>

          {/* Simple Footer */}
          <div className="px-6 py-4 bg-slate-50/80 border-t flex flex-wrap items-center justify-center gap-4 text-slate-400">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] flex items-center gap-1.5">
              <Info size={12} />
              Supports ESC/POS Classic SPP and BLE Printers (58mm/80mm)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Helpful Tips */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-100/50 flex gap-4 items-start">
          <Zap className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-xs font-bold text-amber-900 uppercase tracking-wider">Pro Tip</p>
            <p className="text-[11px] font-medium text-amber-700/80 leading-relaxed">
              If pairing fails, restart your printer and toggle Bluetooth on your phone.
            </p>
          </div>
        </div>
        <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-100/50 flex gap-4 items-start">
          <Smartphone className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-xs font-bold text-blue-900 uppercase tracking-wider">Android Note</p>
            <p className="text-[11px] font-medium text-blue-700/80 leading-relaxed">
              Ensure "Location Services" is turned on to find nearby Bluetooth devices.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
