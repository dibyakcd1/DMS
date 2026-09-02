import { BleClient } from '@capacitor-community/bluetooth-le';
import { Capacitor } from '@capacitor/core';
import { DiscoveredDevice, PrinterAdapter } from './PrinterAdapter';
import { ThermalPrinterNative } from './ThermalPrinterNative';

function numberToUUID(shortId: number): string {
  return `0000${shortId.toString(16).padStart(4, '0')}-0000-1000-8000-00805f9b34fb`;
}

const PRINTER_SERVICE_UUIDS = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
];

const WRITE_CHARACTERISTIC = '000018f1-0000-1000-8000-00805f9b34fb';

type BleDevice = {
  deviceId: string;
  name?: string;
};

type PrinterBridgeDevice = {
  name?: string;
  address?: string;
  mac?: string;
  protocol?: 'classic';
  paired?: boolean;
};

type PrinterBridgeResult = {
  ok?: boolean;
  error?: string;
};

declare global {
  interface Window {
    PrinterBridge?: {
      getPairedDevices: () => string;
      printBase64: (mac: string, b64: string) => string;
    };
  }
}

export class CapacitorBluetoothAdapter implements PrinterAdapter {
  private deviceId: string | null = null;
  private protocol: 'ble' | 'classic' | null = null;
  private _connected = false;

  constructor() {
    this.init();
  }

  private async init() {
    if (Capacitor.isNativePlatform()) {
      try {
        await BleClient.initialize();
      } catch (error) {
        console.error('BLE init failed:', error);
      }
    }
  }

  async scan(): Promise<DiscoveredDevice[]> {
    if (!Capacitor.isNativePlatform()) {
      throw new Error('Capacitor Bluetooth requires a native platform');
    }

    const discovered: DiscoveredDevice[] = [];
    this.addBridgePairedDevices(discovered);

    if (discovered.length === 0) {
      await this.addNativeClassicDevices(discovered);
    }

    await this.addBleDevice(discovered);

    if (discovered.length === 0) {
      throw new Error('No Bluetooth thermal printer found. Pair classic printers in Android Bluetooth settings, then scan again.');
    }

    return discovered;
  }

  async connect(deviceOrId: string | { deviceId?: string; id?: string; address?: string; protocol?: string; rawDevice?: unknown }): Promise<void> {
    const rawDevice = deviceOrId && typeof deviceOrId === 'object' && 'rawDevice' in deviceOrId
      ? deviceOrId.rawDevice as { deviceId?: string; id?: string; address?: string; protocol?: string }
      : deviceOrId;
    const device = rawDevice && typeof rawDevice === 'object' ? rawDevice : deviceOrId;
    const protocol = typeof device === 'object' && device?.protocol === 'classic' ? 'classic' : 'ble';
    const id = typeof device === 'string' ? device : device?.address || device?.deviceId || device?.id;

    if (!id) {
      throw new Error('Bluetooth printer id is missing');
    }

    this.deviceId = id;
    this.protocol = protocol;

    if (protocol === 'classic') {
      if (!this.hasPrinterBridge()) {
        await ThermalPrinterNative.connectClassic({ address: id });
      }
    } else {
      await BleClient.connect(id, () => {
        this._connected = false;
        console.warn('Capacitor BLE disconnected');
      });
    }

    this._connected = true;
  }

  async print(data: Uint8Array): Promise<void> {
    if (!this.deviceId || !this._connected) {
      throw new Error('Not connected');
    }

    if (this.protocol === 'classic') {
      if (this.hasPrinterBridge()) {
        const response = window.PrinterBridge.printBase64(this.deviceId, this.toBase64(data));
        const result = JSON.parse(response || '{}') as PrinterBridgeResult;
        if (result.ok === false) {
          throw new Error(result.error || 'Classic Bluetooth print failed');
        }
        return;
      }

      await ThermalPrinterNative.writeClassic({ data: this.toBase64(data) });
      return;
    }

    const mtu = 20;
    for (let i = 0; i < data.length; i += mtu) {
      const chunk = data.slice(i, i + mtu);
      await BleClient.writeWithoutResponse(
        this.deviceId,
        PRINTER_SERVICE_UUIDS[0],
        WRITE_CHARACTERISTIC,
        new DataView(chunk.buffer)
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this.deviceId) {
      if (this.protocol === 'classic') {
        if (!this.hasPrinterBridge()) {
          await ThermalPrinterNative.disconnectClassic();
        }
      } else {
        await BleClient.disconnect(this.deviceId);
      }
    }

    this._connected = false;
    this.protocol = null;
  }

  isConnected(): boolean {
    return this._connected;
  }

  private addBridgePairedDevices(discovered: DiscoveredDevice[]) {
    for (const device of this.getBridgePairedDevices()) {
      const address = device.address || device.mac;
      if (!address) continue;

      discovered.push({
        id: address,
        address,
        name: device.name || 'Bluetooth Printer',
        protocol: 'classic',
        paired: true,
        rawDevice: {
          ...device,
          id: address,
          address,
          protocol: 'classic',
          paired: true,
          source: 'PrinterBridge',
        },
      });
    }
  }

  private async addNativeClassicDevices(discovered: DiscoveredDevice[]) {
    try {
      const classic = await ThermalPrinterNative.scanClassic();
      for (const device of classic.devices || []) {
        discovered.push({
          id: device.id || device.address || device.name,
          address: device.address,
          name: device.name || 'Bluetooth Printer',
          protocol: 'classic',
          paired: device.paired,
          rawDevice: device,
        });
      }
    } catch (error) {
      console.warn('Classic Bluetooth scan failed:', error);
    }
  }

  private async addBleDevice(discovered: DiscoveredDevice[]) {
    try {
      const bleDevice = await BleClient.requestDevice({
        services: PRINTER_SERVICE_UUIDS.map((uuid) => {
          const parts = uuid.split('-');
          if (parts.length > 1 && parts[0].startsWith('0000')) {
            return numberToUUID(parseInt(parts[0], 16));
          }
          return uuid;
        }),
        optionalServices: PRINTER_SERVICE_UUIDS,
      }) as BleDevice;

      if (bleDevice?.deviceId && !discovered.some((device) => device.id === bleDevice.deviceId)) {
        discovered.push({
          id: bleDevice.deviceId,
          name: bleDevice.name || 'BLE Printer',
          protocol: 'ble',
          rawDevice: bleDevice,
        });
      }
    } catch (error) {
      if (discovered.length === 0) {
        throw error;
      }
      console.warn('BLE scan skipped or cancelled:', error);
    }
  }

  private getBridgePairedDevices(): PrinterBridgeDevice[] {
    if (!this.hasPrinterBridge()) {
      return [];
    }

    try {
      const raw = window.PrinterBridge.getPairedDevices();
      const devices = JSON.parse(raw || '[]');
      return Array.isArray(devices) ? devices : [];
    } catch (error) {
      console.warn('PrinterBridge paired device read failed:', error);
      return [];
    }
  }

  private hasPrinterBridge(): window is Window & { PrinterBridge: NonNullable<Window['PrinterBridge']> } {
    return typeof window !== 'undefined' && !!window.PrinterBridge;
  }

  private toBase64(data: Uint8Array): string {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < data.length; i += chunkSize) {
      binary += String.fromCharCode(...data.slice(i, i + chunkSize));
    }
    return btoa(binary);
  }
}
