import sha256 from 'crypto-js/sha256';

export const Security = {
  hashPin(pin: string): string {
    return sha256(pin).toString();
  },

  verifyPin(enteredPin: string, storedHash: string): boolean {
    if (!enteredPin || !storedHash) return false;
    return sha256(enteredPin).toString() === storedHash;
  }
};
