
export type PrinterState =
  | 'idle'
  | 'checking_bt'
  | 'scanning'
  | 'discovered'
  | 'pairing'
  | 'connecting'
  | 'verifying'
  | 'connected'
  | 'printing'
  | 'disconnecting'
  | 'disconnected'
  | 'error'
  | 'reconnecting';

export type PrinterEvent =
  | 'START_SCAN'
  | 'DEVICE_FOUND'
  | 'USER_SELECTED'
  | 'PAIR_SUCCESS'
  | 'CONNECT_SUCCESS'
  | 'VERIFY_SUCCESS'
  | 'PRINT_START'
  | 'PRINT_DONE'
  | 'DISCONNECT'
  | 'CONNECTION_LOST'
  | 'RETRY'
  | 'ERROR';

export function printerReducer(
  state: PrinterState,
  event: PrinterEvent
): PrinterState {
  const transitions: Record<PrinterState, Partial<Record<PrinterEvent, PrinterState>>> = {
    idle:          { START_SCAN: 'scanning' },
    checking_bt:   { START_SCAN: 'scanning', ERROR: 'error' },
    scanning:      { DEVICE_FOUND: 'discovered', ERROR: 'error', CONNECTION_LOST: 'idle' },
    discovered:    { USER_SELECTED: 'pairing', START_SCAN: 'scanning' },
    pairing:       { PAIR_SUCCESS: 'connecting', ERROR: 'error' },
    connecting:    { CONNECT_SUCCESS: 'verifying', ERROR: 'error' },
    verifying:     { VERIFY_SUCCESS: 'connected', ERROR: 'error' },
    connected:     { PRINT_START: 'printing', DISCONNECT: 'disconnecting', CONNECTION_LOST: 'reconnecting' },
    printing:      { PRINT_DONE: 'connected', ERROR: 'error', CONNECTION_LOST: 'reconnecting' },
    disconnecting: { DISCONNECT: 'disconnected' },
    disconnected:  { START_SCAN: 'scanning' },
    reconnecting:  { CONNECT_SUCCESS: 'connected', ERROR: 'error', RETRY: 'reconnecting' },
    error:         { RETRY: 'scanning', START_SCAN: 'scanning', DISCONNECT: 'idle' },
  };

  return transitions[state]?.[event] ?? state;
}
