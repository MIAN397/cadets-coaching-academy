/**
 * Utility functions for WhatsApp messaging integrations
 */

/**
 * Formats a phone number for WhatsApp wa.me links.
 * Removes spaces, hyphens, plus signs, and formats local PK numbers (starting with 0) to international format (starting with 92).
 */
export const formatWhatsAppPhone = (phone: string): string => {
  if (!phone) return '';
  let cleaned = phone.replace(/[+\s\-()]/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '92' + cleaned.substring(1);
  }
  return cleaned;
};

/**
 * Generates a standard wa.me URL with a prefilled URL-encoded message text.
 */
export const getWhatsAppLink = (phone: string, message: string): string => {
  const cleanPhone = formatWhatsAppPhone(phone);
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
};

/**
 * Opens the WhatsApp Web/App redirect in a new browser tab.
 */
export const sendWhatsAppMessage = (phone: string, message: string): void => {
  const url = getWhatsAppLink(phone, message);
  window.open(url, '_blank');
};

/**
 * Returns tomorrow's date string in local YYYY-MM-DD format.
 */
export const getTomorrowDateString = (): string => {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const offset = tomorrow.getTimezoneOffset();
  const adjustedTomorrow = new Date(tomorrow.getTime() - (offset * 60 * 1000));
  return adjustedTomorrow.toISOString().split('T')[0];
};
