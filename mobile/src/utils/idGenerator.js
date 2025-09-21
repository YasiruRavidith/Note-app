// mobile/src/utils/idGenerator.js

/**
 * Generates a unique ID similar to Prisma's cuid format
 * Format: c + timestamp + random string
 */
export function generateId() {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 15);
  const morePadding = Math.random().toString(36).substring(2, 8);
  
  return `c${timestamp}${randomPart}${morePadding}`;
}

/**
 * Generates a shorter ID for temporary/local use
 */
export function generateShortId() {
  return Math.random().toString(36).substring(2, 15);
}

/**
 * Generates a UUID-like ID
 */
export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}