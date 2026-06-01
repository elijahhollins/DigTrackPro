import crypto from 'node:crypto';

const getKey = () => {
  const secret = process.env.INBOUND_EMAIL_SECRET;
  if (!secret || secret.trim().length < 16) {
    throw new Error('INBOUND_EMAIL_SECRET is not configured.');
  }
  return crypto.createHash('sha256').update(secret).digest();
};

export const encryptSecret = (plainText) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map(part => part.toString('base64url')).join('.');
};

export const decryptSecret = (encoded) => {
  const [ivRaw, tagRaw, encryptedRaw] = String(encoded || '').split('.');
  if (!ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error('Stored inbound email secret is invalid.');
  }
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getKey(),
    Buffer.from(ivRaw, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, 'base64url')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
};
