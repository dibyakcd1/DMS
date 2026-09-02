
import { PrinterAdapter } from "./PrinterAdapter";

const PRINTER_SERVICE_UUIDS = [
  '000018f0-0000-1000-8000-00805f9b34fb',  // common ESC/POS BLE
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',  // Xprinter / MUNBYN
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',  // Rongta
  '00001101-0000-1000-8000-00805f9b34fb',  // SPP over BLE fallback
];

const WRITE_CHARACTERISTIC = '000018f1-0000-1000-8000-00805f9b34fb';
const NOTIFY_CHARACTERISTIC = '000018f2-0000-1000-8000-00805f9b34fb';

export class WebBluetoothAdapter implements PrinterAdapter {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private writeChar: BluetoothRemoteGATTCharacteristic | null = null;
  private notifyChar: BluetoothRemoteGATTCharacteristic | null = null;
  private _connected = false;

  async scan(): Promise<BluetoothDevice[]> {
    if (!navigator.bluetooth) {
      throw new Error("Web Bluetooth API is not available in this browser or environment.");
    }
    
    try {
      // @ts-expect-error - Web Bluetooth API might be missing in some environments
      const device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: PRINTER_SERVICE_UUIDS },
          { namePrefix: 'Printer' },
          { namePrefix: 'XP-' },
          { namePrefix: 'MTP' },
          { namePrefix: 'POS' },
          { namePrefix: 'BT' },
        ],
        optionalServices: PRINTER_SERVICE_UUIDS,
      });
      return [device];
    } catch (error: unknown) {
      const err = error as Error;
      if (err.name === 'SecurityError') {
        throw new Error("Bluetooth access blocked by security policy. Try opening this app in a new tab.");
      }
      if (err.name === 'NotFoundError') {
        throw new Error("No compatible bluetooth printer selected.");
      }
      throw error;
    }
  }

  async connect(rawDevice?: BluetoothDevice): Promise<void> {
    if (rawDevice) {
      this.device = rawDevice;
    } else {
      const devices = await this.scan();
      this.device = devices[0];
    }

    if (!this.device.gatt) throw new Error("GATT not supported on this device");
    
    this.server = await this.device.gatt.connect();

    // Try to find the service from our list
    let service: BluetoothRemoteGATTService | null = null;
    for (const uuid of PRINTER_SERVICE_UUIDS) {
      try {
        service = await this.server.getPrimaryService(uuid);
        if (service) break;
      } catch (e) {
        continue;
      }
    }

    if (!service) {
        // Try to get all services if specific ones fail
        try {
            const services = await this.server.getPrimaryServices();
            if (services.length > 0) service = services[0];
        } catch (e) {
            console.warn("Could not discover services:", e);
        }
    }

    if (!service) throw new Error("Primary service not found");

    // Characteristic discovery
    try {
        this.writeChar = await service.getCharacteristic(WRITE_CHARACTERISTIC);
    } catch (e) {
        // Try to find ANY writeable characteristic
        const chars = await service.getCharacteristics();
        this.writeChar = chars.find(c => c.properties.write || c.properties.writeWithoutResponse) || null;
    }

    if (!this.writeChar) throw new Error("Write characteristic not found");

    try {
      this.notifyChar = await service.getCharacteristic(NOTIFY_CHARACTERISTIC);
      if (this.notifyChar && this.notifyChar.properties.notify) {
          await this.notifyChar.startNotifications();
          this.notifyChar.addEventListener('characteristicvaluechanged', (event: Event) => {
            const target = event.target as BluetoothRemoteGATTCharacteristic;
            if (target.value) {
                const status = new Uint8Array(target.value.buffer);
                console.log("Printer internal status update:", status[0]);
            }
          });
      }
    } catch (e) {
        console.warn("Notify characteristic not found or failed to start:", e);
    }

    this.device.addEventListener('gattserverdisconnected', () => {
      this._connected = false;
      console.warn("Printer disconnected from GATT server");
    });

    this._connected = true;
  }

  async print(data: Uint8Array): Promise<void> {
    if (!this.writeChar) throw new Error('Not connected');
    
    const MTU = 120; // Safe chunk size for many BLE printers to avoid buffer overflow
    for (let i = 0; i < data.length; i += MTU) {
      const chunk = data.slice(i, i + MTU);
      if (this.writeChar.properties.writeWithoutResponse) {
          await this.writeChar.writeValueWithoutResponse(chunk);
      } else {
          await this.writeChar.writeValueWithResponse(chunk);
      }
      // Increased delay slightly to give printer time to process buffers
      await new Promise(r => setTimeout(r, 60)); 
    }
  }

  async disconnect(): Promise<void> {
    if (this.notifyChar) {
        try {
            await this.notifyChar.stopNotifications();
        } catch (e) {
            console.warn("Error stopping notifications:", e);
        }
    }
    if (this.server) this.server.disconnect();
    this._connected = false;
  }

  isConnected() {
    return this._connected && !!this.server?.connected;
  }
}
