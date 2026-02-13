const crypto = require('crypto');

function hashPin(pin) {
  return crypto
    .createHash('sha256')
    .update(pin)
    .digest('hex');
}

function verifyPin(pin, hash) {
  if (!pin || !hash) return false;
  return hashPin(pin) === hash;
}

module.exports = {
  hashPin,
  verifyPin
};
