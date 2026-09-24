const USER_MESSAGES: Record<string, string> = {
  'new row violates row-level security': 'You do not have permission to perform this action.',
  'violates foreign key constraint': 'This record is linked to other data and cannot be modified.',
  'products_division_category_check': 'Please select a valid product category from the list.',
  'violates check constraint': 'One or more fields do not meet validation requirements. Please verify your entries.',
  'duplicate key value': 'A record with this value already exists.',
  'insufficient_stock': 'Insufficient stock available for this order.',
  'credit_limit_exceeded': 'This order exceeds the shop\'s credit limit.',
  'invalid_pin': 'Incorrect PIN. Please try again.',
  'session_expired': 'Your session has expired. Please log in again.',
  'jwt expired': 'Your session has expired. Please log in again.',
  'failed to fetch': 'Network error. Please check your internet connection.',
  'fetch failed': 'Network error. Please check your internet connection.',
  'network error': 'Network error. Please check your internet connection.',
  'networkerror': 'Network error. Please check your internet connection.',
  'load failed': 'Network error. Please check your internet connection.',
  'invalid login credentials': 'Invalid email or password.',
  'email not confirmed': 'Your email is not confirmed. Please check your inbox for the confirmation link or contact an administrator.',
  'gemini_key_required': 'A Google Gemini API Key is required to scan image and PDF invoices on static Git hosting. Please configure it in Settings or click Setup AI Key.',
  'leaked': 'Your Gemini API Key has been reported as leaked or blocked by Google. Please update it in Settings.',
  'api key': 'Your Gemini API Key is missing, invalid, or leaked. Please configure it in Settings.',
  'permission_denied': 'Access denied or API Key is invalid. Please check your Gemini API key in Settings.',
};

export function friendlyError(err: unknown): string {
  if (!err) return 'An unexpected error occurred. Please try again.';

  let msg = '';
  if (typeof err === 'string') {
    msg = err;
  } else if (err instanceof Error) {
    msg = err.message;
  } else if (typeof err === 'object') {
    const errorObj = err as Record<string, unknown>;
    const extracted = errorObj.message || errorObj.details || errorObj.error_description || errorObj.hint || errorObj.error;
    if (typeof extracted === 'string') {
      msg = extracted;
    } else {
      try {
        msg = JSON.stringify(err);
      } catch {
        msg = 'An unexpected error occurred.';
      }
    }
  } else {
    msg = String(err);
  }

  if (!msg || msg === '[object Object]') {
    msg = 'An unexpected error occurred. Please try again.';
  }

  if (msg.startsWith("Database Error: ")) {
    msg = msg.replace("Database Error: ", "");
  }
  if (msg.includes("Gemini") || msg.includes("API Key") || msg.includes("Settings") || msg.includes("leaked") || msg.includes("blocked")) {
    return msg;
  }
  for (const [key, friendly] of Object.entries(USER_MESSAGES)) {
    if (msg.toLowerCase().includes(key.toLowerCase())) return friendly;
  }
  return msg;
}

