import React, { useState, ReactNode, useRef } from 'react';
import { PrinterContext, type PrinterState, type PrinterDevice, type PrinterContextType } from './PrinterContextCore';
import { WebBluetoothAdapter } from './adapters/WebBluetoothAdapter';
import { CapacitorBluetoothAdapter } from './adapters/CapacitorBluetoothAdapter';
import { Capacitor } from '@capacitor/core';
import { PrinterAdapter } from './adapters/PrinterAdapter';

export const PrinterProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<PrinterState>('disconnected');
  const [errorReason, setErrorReason] = useState<string | null>(null);
  const [connectedDevice, setConnectedDevice] = useState<PrinterDevice | null>(null);
  const [discoveredDevices, setDiscoveredDevices] = useState<PrinterDevice[]>([]);
  const [isSimulated, setIsSimulated] = useState(false);
  const adapterRef = useRef<PrinterAdapter | null>(null);

  const getAdapter = () => {
    if (!adapterRef.current) {
      if (Capacitor.isNativePlatform()) {
        adapterRef.current = new CapacitorBluetoothAdapter();
      } else {
        adapterRef.current = new WebBluetoothAdapter();
      }
    }
    return adapterRef.current;
  };

  const connect = async (device?: PrinterDevice) => {
    try {
      setState('connecting');
      setErrorReason(null);
      
      if (isSimulated) {
        await new Promise(r => setTimeout(r, 1500));
        setConnectedDevice({ name: 'Virtual Thermal Printer v1.0', address: '00:11:22:33:44:55' });
        setState('connected');
        return;
      }

      const adapter = getAdapter();
      await adapter.connect(device?.rawDevice ?? device);
      
      setConnectedDevice({
        id: device?.id,
        address: device?.address,
        protocol: device?.protocol,
        paired: device?.paired,
        name: device?.name || (device?.rawDevice as BluetoothDevice)?.name || 'Bluetooth Printer',
        rawDevice: device?.rawDevice ?? device
      });
      setState('connected');
    } catch (error) {
      console.error('Connection failed:', error);
      setErrorReason(error instanceof Error ? error.message : 'Unknown connection error');
      setState('error');
    }
  };

  const disconnect = async () => {
    try {
      if (isSimulated) {
        setState('disconnected');
        setConnectedDevice(null);
        return;
      }
      const adapter = getAdapter();
      await adapter.disconnect();
      setConnectedDevice(null);
      setState('disconnected');
      setErrorReason(null);
    } catch (error) {
      console.error('Disconnect failed:', error);
      setState('disconnected');
    }
  };

  const scan = async () => {
    try {
      setState('scanning');
      setErrorReason(null);

      if (isSimulated) {
        await new Promise(r => setTimeout(r, 2000));
        const mockDevice: PrinterDevice = { name: 'Virtual Thermal Printer v1.0' };
        await connect(mockDevice);
        return [mockDevice];
      }

      const adapter = getAdapter();
      const devices = await adapter.scan();
      
      const printerDevices: PrinterDevice[] = devices.map((device) => {
        const item = device as PrinterDevice & BluetoothDevice & { deviceId?: string };
        return {
          id: item.id || item.deviceId || item.address,
          address: item.address,
          protocol: item.protocol,
          paired: item.paired,
          name: item.name || 'Unknown Printer',
          rawDevice: item.rawDevice ?? device
        };
      });

      setDiscoveredDevices(printerDevices);
      
      if (printerDevices.length === 1) {
        await connect(printerDevices[0]);
      } else {
        setState('disconnected');
      }

      return printerDevices;
    } catch (error) {
      console.error('Scan failed:', error);
      setErrorReason(error instanceof Error ? error.message : 'Bluetooth scan rejected');
      setState('error');
    }
  };

  const print = async (data: Uint8Array) => {
    if (isSimulated) {
      console.log('Simulated Print (bytes):', data.length);
      await new Promise(r => setTimeout(r, 2000));
      return;
    }

    const adapter = getAdapter();
    if (!adapter.isConnected()) {
      setState('error');
      setErrorReason('Printer disconnected while spooling');
      throw new Error('Printer not connected');
    }
    await adapter.print(data);
  };

  return (
    <PrinterContext.Provider value={{ 
      state, 
      errorReason, 
      connectedDevice, 
      discoveredDevices,
      connect, 
      disconnect, 
      scan, 
      print,
      isSimulated,
      setSimulated: setIsSimulated
    }}>
      {children}
    </PrinterContext.Provider>
  );
};
