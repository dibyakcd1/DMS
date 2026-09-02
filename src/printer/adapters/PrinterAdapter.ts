
export interface PrinterAdapter {
  scan(): Promise<unknown[]>;
  connect(deviceIdOrObj?: unknown): Promise<void>;
  disconnect(): Promise<void>;
  print(data: Uint8Array): Promise<void>;
  isConnected(): boolean;
}

export interface DiscoveredDevice {
  id: string;
  name: string;
  address?: string;
  paired?: boolean;
  rssi?: number;
  protocol: 'ble' | 'classic' | 'usb' | 'network';
  rawDevice?: unknown;
}
