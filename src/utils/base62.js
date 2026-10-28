const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const BASE = ALPHABET.length; // 62
const OFFSET = 99999999; // Ensures the first ID (1) becomes a 5-char code ('6LAze')

export function encodeBase62(id) {
  let num = Number(id) + OFFSET;
  let shortCode = '';

  while (num > 0) {
    shortCode = ALPHABET[num % BASE] + shortCode;
    num = Math.floor(num / BASE);
  }

  return shortCode;
}