import { generateSecret, generateSync, generateURI, verifySync } from 'otplib';

// Обгортка над otplib v13 (функціональний API): TOTP для двофакторної автентифікації
export function createTotpSecret() {
  return generateSecret();
}

export function totpUri(email, issuer, secret) {
  return generateURI({ issuer, label: email, secret });
}

export function generateTotpCode(secret) {
  return generateSync({ secret });
}

// epochTolerance: 1 — дозволяємо відхилення ±1 крок (30 с), щоб компенсувати розсинхронізацію годинника
export function checkTotpCode(secret, token) {
  try {
    const result = verifySync({ secret, token, epochTolerance: 1 });
    return typeof result === 'boolean' ? result : Boolean(result?.valid);
  } catch {
    return false;
  }
}
