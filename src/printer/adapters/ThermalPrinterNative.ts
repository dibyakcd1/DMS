import { registerPlugin } from '@capacitor/core';

export type NativePrinterDevice = {
  id: string;
  address?: string;
  name: string;
  protocol: 'classic';
  paired?: boolean;
};

type ScanClassicResult = {
  devices: NativePrinterDevice[];
};

export interface ThermalPrinterPlugin {
  scanClassic(): Promise<ScanClassicResult>;
  connectClassic(options: { address: string }): Promise<void>;
  writeClassic(options: { data: string }): Promise<void>;
  disconnectClassic(): Promise<void>;
}

export const ThermalPrinterNative = registerPlugin<ThermalPrinterPlugin>('ThermalPrinter');
