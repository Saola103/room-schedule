import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth'
import type { Reservation } from '@/lib/reservations'
import { getReservationDisplayName, validateReservationPayload } from '@/lib/reservations'
import { getClientIp, takeRateLimit } from '@/lib/security'
import { getSupabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'

type ReservationRow = {
  id: string
  date: string
  slot: Reservation['slot']
  name: string
  created_at: string
}

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      ...init?.headers,
    },
  })
}

function toReservation(row: ReservationRow, canDelete: boolean): Reservation {
  return {
    id: row.id,
    date: row.date,
    slot: row.slot,
    name: row.name,
    created_at: row.created_at,
    canDelete,
  }
}

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req)
  if (!auth.ok) {
    return json({ error: auth.error }, { status: auth.status })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('reservations')
    .select('id, date, slot, name, created_at')
    .order('date', { ascending: true })

  if (error) {
    console.error('Failed to fetch reservations', error)
    return json({ error: '予約の取得に失敗しました' }, { status: 500 })
  }

  return json((data ?? []).map((row) => toReservation(row, auth.user.isAdmin)))
}

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req)
  if (!auth.ok) {
    return json({ error: auth.error }, { status: auth.status })
  }

  const supabase = getSupabaseAdmin()

  const limit = await takeRateLimit({
    key: `reservation:create:${auth.user.email}:${getClientIp(req)}`,
    limit: 10,
    windowMs: 60_000,
    supabase,
  })
  if (!limit.allowed) {
    return json(
      { error: '短時間に予約が送信されすぎています。少し待ってから再度お試しください' },
      {
        status: 429,
        headers: {
          'Retry-After': String(limit.retryAfterSeconds),
        },
      }
    )
  }

  const contentType = req.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    return json(
      { error: 'Content-Type は application/json を指定してください' },
      { status: 415 }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json({ error: 'JSON の形式が不正です' }, { status: 400 })
  }

  const result = validateReservationPayload(body)
  if (!result.ok) {
    return json({ error: result.error }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('reservations')
    .insert([
      {
        ...result.value,
        name: getReservationDisplayName(auth.user.email),
      },
    ])
    .select('id, date, slot, name, created_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      return json({ error: 'その時間帯はすでに予約されています' }, { status: 409 })
    }

    console.error('Failed to create reservation', error)
    return json({ error: '予約の作成に失敗しました' }, { status: 500 })
  }

  return json(toReservation(data, auth.user.isAdmin), { status: 201 })
}
