// src/lib/rateLimit.ts - Production-ready rate limiting

// For production, install: npm install @upstash/redis @upstash/ratelimit

import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  reset: number;
}

// In-memory fallback (for development or if Redis is not configured)
const memoryStore = new Map<string, { count: number; resetAt: number }>();

function cleanupMemoryStore() {
  const now = Date.now();
  for (const [key, value] of memoryStore.entries()) {
    if (now > value.resetAt) {
      memoryStore.delete(key);
    }
  }
}

// Clean up every minute
setInterval(cleanupMemoryStore, 60 * 1000);

/**
 * In-memory rate limiter (development/fallback)
 */
export function memoryRateLimit(
  userId: string,
  maxRequests: number = 20,
  windowMs: number = 60 * 1000
): RateLimitResult {
  const now = Date.now();
  const userLimit = memoryStore.get(userId);

  if (!userLimit || now > userLimit.resetAt) {
    const resetAt = now + windowMs;
    memoryStore.set(userId, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: maxRequests - 1,
      reset: resetAt,
    };
  }

  if (userLimit.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      reset: userLimit.resetAt,
    };
  }

  userLimit.count++;
  return {
    allowed: true,
    remaining: maxRequests - userLimit.count,
    reset: userLimit.resetAt,
  };
}

// Initialize Redis client
// Ensure you have UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in your .env file
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

// Create rate limiter
const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '1 m'), // 20 requests per minute
  analytics: true,
  prefix: 'auraiq',
});

export async function redisRateLimit(userId: string): Promise<RateLimitResult> {
  const { success, limit, remaining, reset } = await ratelimit.limit(userId);
  
  return {
    allowed: success,
    remaining,
    reset: reset * 1000, // Convert to milliseconds
  };
}

/**
 * Main rate limit function - uses Redis if available, falls back to memory
 */
export async function checkRateLimit(userId: string): Promise<RateLimitResult> {
  // Check if Redis is configured
  const hasRedis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN;

  if (hasRedis) {
    // Use Redis rate limiting
    return await redisRateLimit(userId);
  }

  // Fallback to in-memory rate limiting
  console.warn('Redis not configured. Using memory fallback.');
  return memoryRateLimit(userId);
}

/**
 * Rate limit tiers based on user plan (for future expansion)
 */
export const RATE_LIMIT_TIERS = {
  free: { requests: 20, windowMs: 60 * 1000 },      // 20 per minute
  basic: { requests: 50, windowMs: 60 * 1000 },     // 50 per minute
  pro: { requests: 100, windowMs: 60 * 1000 },      // 100 per minute
  enterprise: { requests: 500, windowMs: 60 * 1000 }, // 500 per minute
};

/**
 * Get rate limit for a user based on their tier
 */
export function getRateLimitForTier(tier: keyof typeof RATE_LIMIT_TIERS = 'free') {
  return RATE_LIMIT_TIERS[tier];
}