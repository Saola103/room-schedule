import { createClient } from '@supabase/supabase-js'

export type Slot = '昼' | '放課後'
export const SLOTS: Slot[] = ['昼', '放課後']

export type Reservation = {
  id: string
  date: string
  slot: Slot
  name: string
  created_at: string
}

export function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key || url === 'your_supabase_project_url') {
    throw new Error('Supabase environment variables are not configured')
  }
  return createClient(url, key)
}
