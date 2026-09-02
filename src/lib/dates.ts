export function clampOrderDate(dateStr: string): string {
  const parsedDate = new Date(dateStr);
  if (isNaN(parsedDate.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  
  if (parsedDate > today) {
    return new Date().toISOString().slice(0, 10);
  }
  
  return dateStr;
}
