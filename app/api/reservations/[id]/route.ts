import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth'
import { isValidReservationId } from '@/lib/reservations'
import { getClientIp, takeRateLimit } from '@/lib/security'
import { getSupabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      ...init?.headers,
    },
  })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(req)
  if (!auth.ok) {
    return json({ error: auth.error }, { status: auth.status })
  }

  const { id } = await params
  if (!isValidReservationId(id)) {
    return json({ error: '予約IDが不正です' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  const limit = await takeRateLimit({
    key: `reservation:delete:${auth.user.email}:${getClientIp(req)}`,
    limit: 10,
    windowMs: 60_000,
    supabase,
  })
  if (!limit.allowed) {
    return json(
      { error: '短時間に削除が送信されすぎています。少し待ってから再度お試しください' },
      {
        status: 429,
        headers: {
          'Retry-After': String(limit.retryAfterSeconds),
        },
      }
    )
  }

  const { data, error } = await supabase
    .from('reservations')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('Failed to delete reservation', error)
    return json({ error: '予約の削除に失敗しました' }, { status: 500 })
  }

  if (!data) {
    return json({ error: '予約が見つかりません' }, { status: 404 })
  }

  return json({ success: true })
}
