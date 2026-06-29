const { Redis } = require('@upstash/redis');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';

function userKey(email) { return `user:${email.toLowerCase()}`; }
async function getUser(email) { return await redis.get(userKey(email)); }
async function saveUser(email, data) { await redis.set(userKey(email), data); }
async function hashPassword(pw) { return bcrypt.hash(pw, 10); }
async function checkPassword(pw, hash) { return bcrypt.compare(pw, hash); }
function signToken(payload) { return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' }); }
function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}
function requireAuth(req) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return null;
  return verifyToken(token);
}
function credKey(userId, platform) { return `creds:${userId}:${platform}`; }
async function saveCreds(userId, platform, email, password) {
  await redis.set(credKey(userId, platform), {
    email,
    password: Buffer.from(password).toString('base64'),
    updatedAt: Date.now()
  });
}
async function getCreds(userId, platform) {
  const data = await redis.get(credKey(userId, platform));
  if (!data) return null;
  return { email: data.email, password: Buffer.from(data.password, 'base64').toString('utf8') };
}
async function getAllCreds(userId) {
  const platforms = ['netflix', 'disney', 'amazon', 'flow'];
  const results = {};
  for (const p of platforms) {
    const c = await getCreds(userId, p);
    if (c) results[p] = c;
  }
  return results;
}

module.exports = { redis, userKey, getUser, saveUser, hashPassword, checkPassword, signToken, verifyToken, requireAuth, credKey, saveCreds, getCreds, getAllCreds };
