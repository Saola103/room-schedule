import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export async function GET() {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .order('date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase()
  const body = await req.json()
  const { date, slot, name } = body

  if (!date || !slot || !name) {
    return NextResponse.json({ error: '日付・時間帯・名前は必須です' }, { status: 400 })
  }
  if (slot !== '昼' && slot !== '放課後') {
    return NextResponse.json({ error: '時間帯は「昼」か「放課後」のみです' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('reservations')
    .insert([{ date, slot, name }])
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'その時間帯はすでに予約されています' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
