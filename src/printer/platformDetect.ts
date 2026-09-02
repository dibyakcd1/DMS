
export const isIOS = () => typeof window !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
export const isAndroid = () => typeof window !== 'undefined' && /Android/.test(navigator.userAgent);
export const isWindows = () => typeof window !== 'undefined' && navigator.platform.startsWith('Win');

export const supportsWebBluetooth = () => typeof navigator !== 'undefined' && 'bluetooth' in navigator;

export async function checkBluetoothAvailability(): Promise<{
  available: boolean;
  reason?: 'off' | 'unsupported' | 'permission_denied' | 'ios_ble_only';
}> {
  if (isIOS() && !supportsWebBluetooth()) {
    // iOS blocks Web Bluetooth in most browsers — usually needs Capacitor or specific apps
    return { available: true, reason: 'ios_ble_only' };
  }
  
  if (!supportsWebBluetooth()) {
    return { available: false, reason: 'unsupported' };
  }

  try {
    // @ts-expect-error - Web Bluetooth API might be missing in some environments
    const available = await navigator.bluetooth.getAvailability();
    if (!available) return { available: false, reason: 'off' };
    return { available: true };
  } catch {
    return { available: false, reason: 'permission_denied' };
  }
}

export function watchBluetoothState(onChange: (on: boolean) => void) {
  // @ts-expect-error - Web Bluetooth API might be missing in some environments
  navigator.bluetooth?.addEventListener('availabilitychanged', (e: { value: boolean }) => {
    onChange(e.value);
  });
}
