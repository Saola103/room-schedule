import type { SupabaseClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'

const rateLimitStore = new Map<string, { count: number; resetAt: number }>()

type RateLimitResult = {
  allowed: boolean
  retryAfterSeconds: number
}

export function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || 'unknown'
  }

  return request.headers.get('x-real-ip') ?? 'unknown'
}

function takeLocalRateLimit({
  key,
  limit,
  windowMs,
}: {
  key: string
  limit: number
  windowMs: number
}): RateLimitResult {
  const now = Date.now()
  const current = rateLimitStore.get(key)

  if (!current || current.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true as const, retryAfterSeconds: Math.ceil(windowMs / 1000) }
  }

  if (current.count >= limit) {
    return {
      allowed: false as const,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    }
  }

  current.count += 1
  return {
    allowed: true as const,
    retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  }
}

export async function takeRateLimit({
  key,
  limit,
  windowMs,
  supabase,
}: {
  key: string
  limit: number
  windowMs: number
  supabase?: SupabaseClient
}): Promise<RateLimitResult> {
  if (!supabase) {
    return takeLocalRateLimit({ key, limit, windowMs })
  }

  try {
    const { data, error } = await supabase.rpc('consume_rate_limit', {
      p_key: key,
      p_limit: limit,
      p_window_seconds: Math.ceil(windowMs / 1000),
    })

    if (error) {
      throw error
    }

    const row = Array.isArray(data) ? data[0] : data
    if (!row || typeof row.allowed !== 'boolean') {
      throw new Error('Invalid rate limit response')
    }

    return {
      allowed: row.allowed,
      retryAfterSeconds:
        typeof row.retry_after_seconds === 'number'
          ? row.retry_after_seconds
          : Math.ceil(windowMs / 1000),
    }
  } catch (error) {
    console.error('Failed to consume database rate limit, falling back to local store', error)
    return takeLocalRateLimit({ key, limit, windowMs })
  }
}
