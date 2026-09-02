import { createContext, useContext } from 'react';

export type PrinterState = 'disconnected' | 'connecting' | 'connected' | 'error' | 'scanning';

export interface PrinterDevice {
  name: string;
  address?: string;
  id?: string;
  protocol?: 'ble' | 'classic' | 'usb' | 'network';
  paired?: boolean;
  rawDevice?: unknown;
}

export interface PrinterContextType {
  state: PrinterState;
  errorReason?: string | null;
  connectedDevice: PrinterDevice | null;
  discoveredDevices?: PrinterDevice[];
  connect: (device?: PrinterDevice) => Promise<void>;
  disconnect: () => Promise<void>;
  scan: () => Promise<void | PrinterDevice[]>;
  print: (data: Uint8Array) => Promise<void>;
  isSimulated?: boolean;
  setSimulated?: (enabled: boolean) => void;
}

export const PrinterContext = createContext<PrinterContextType | undefined>(undefined);

export const usePrinter = () => {
  const context = useContext(PrinterContext);
  if (context === undefined) {
    throw new Error('usePrinter must be used within a PrinterProvider');
  }
  return context;
};
