import type { NextRequest } from 'next/server'
import { getSupabaseReadonly } from '@/lib/supabase'

export type AuthenticatedUser = {
  id: string
  email: string
  isAdmin: boolean
}

function getAllowedEmailDomains() {
  return (process.env.ALLOWED_EMAIL_DOMAINS ?? '')
    .split(',')
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean)
}

function getAdminEmails() {
  return (process.env.RESERVATION_ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
}

function isAllowedEmail(email: string) {
  const domains = getAllowedEmailDomains()
  if (domains.length === 0) {
    throw new Error('ALLOWED_EMAIL_DOMAINS is not configured')
  }

  const normalized = email.trim().toLowerCase()
  return domains.some((domain) => normalized.endsWith(`@${domain}`))
}

export async function authenticateRequest(request: NextRequest) {
  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) {
    return { ok: false as const, status: 401, error: 'ログインが必要です' }
  }

  const token = authorization.slice('Bearer '.length).trim()
  if (!token) {
    return { ok: false as const, status: 401, error: 'ログインが必要です' }
  }

  try {
    const supabase = getSupabaseReadonly()
    const { data, error } = await supabase.auth.getUser(token)

    if (error || !data.user?.email) {
      return { ok: false as const, status: 401, error: 'ログインが必要です' }
    }

    if (!isAllowedEmail(data.user.email)) {
      return {
        ok: false as const,
        status: 403,
        error: '校内メールアドレスでログインしてください',
      }
    }

    const email = data.user.email.toLowerCase()
    return {
      ok: true as const,
      user: {
        id: data.user.id,
        email,
        isAdmin: getAdminEmails().includes(email),
      } satisfies AuthenticatedUser,
    }
  } catch (error) {
    console.error('Failed to authenticate request', error)
    return {
      ok: false as const,
      status: 500,
      error: '認証設定が未完了です。管理者に確認してください',
    }
  }
}
