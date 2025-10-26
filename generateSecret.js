// generateSecret.js
const crypto = require('crypto');

// Generate a 32-byte (256-bit) random string, encoded as hex (64 characters)
const secretKey = crypto.randomBytes(32).toString('hex');
console.log('Generated Secret Key:', secretKey);