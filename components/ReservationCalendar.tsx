'use client'

import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { DateClickArg } from '@fullcalendar/interaction'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getReservationDisplayName,
  isPastReservationDate,
  type Reservation,
  SLOTS,
  type Slot,
} from '@/lib/reservations'
import { getSupabaseBrowser } from '@/lib/supabase-browser'

type ModalState =
  | { type: 'closed' }
  | { type: 'book'; date: string; slot: Slot }
  | { type: 'detail'; reservation: Reservation }

const ALLOWED_EMAIL_DOMAINS = (process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS ?? '')
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean)

function isAllowedSchoolEmail(email: string) {
  const normalized = email.trim().toLowerCase()
  if (ALLOWED_EMAIL_DOMAINS.length === 0) return true
  return ALLOWED_EMAIL_DOMAINS.some((domain) => normalized.endsWith(`@${domain}`))
}

export default function ReservationCalendar() {
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [modal, setModal] = useState<ModalState>({ type: 'closed' })
  const [dayPanel, setDayPanel] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [supabaseReady, setSupabaseReady] = useState(false)
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [booting, setBooting] = useState(true)
  const [loading, setLoading] = useState(false)
  const [authLoading, setAuthLoading] = useState(false)
  const [error, setError] = useState('')
  const [authError, setAuthError] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)

  const fetchReservations = useCallback(async (token: string) => {
    const res = await fetch('/api/reservations', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    })
    const data = await res.json().catch(() => null)

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        setReservations([])
      }
      throw new Error(data?.error ?? '予約の取得に失敗しました')
    }

    setReservations(Array.isArray(data) ? data : [])
  }, [])

  useEffect(() => {
    let active = true

    try {
      getSupabaseBrowser()
      if (active) {
        setSupabaseReady(true)
      }
    } catch (setupError) {
      if (active) {
        setBooting(false)
        setAuthError(
          setupError instanceof Error
            ? setupError.message
            : 'Supabase の初期化に失敗しました'
        )
      }
    }

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!supabaseReady) return

    let active = true
    const supabase = getSupabaseBrowser()

    async function bootstrap() {
      const { data } = await supabase.auth.getSession()
      if (!active) return

      const token = data.session?.access_token ?? null
      const currentEmail = data.session?.user.email?.toLowerCase() ?? null

      setSessionToken(token)
      setUserEmail(currentEmail)
      setBooting(false)

      if (token) {
        try {
          await fetchReservations(token)
        } catch (fetchError) {
          if (active) {
            setAuthError(
              fetchError instanceof Error ? fetchError.message : '予約の取得に失敗しました'
            )
          }
        }
      }
    }

    void bootstrap()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const token = session?.access_token ?? null
      const currentEmail = session?.user.email?.toLowerCase() ?? null

      setSessionToken(token)
      setUserEmail(currentEmail)
      setReservations([])
      setModal({ type: 'closed' })
      setDayPanel(null)

      if (!token) return

      void fetchReservations(token).catch((fetchError) => {
        setAuthError(
          fetchError instanceof Error ? fetchError.message : '予約の取得に失敗しました'
        )
      })
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [fetchReservations, supabaseReady])

  useEffect(() => {
    if (dayPanel && panelRef.current) {
      setTimeout(
        () => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }),
        50
      )
    }
  }, [dayPanel])

  function reservationsForDate(date: string) {
    return reservations.filter((reservation) => reservation.date === date)
  }

  function slotReservation(date: string, slot: Slot) {
    return reservations.find(
      (reservation) => reservation.date === date && reservation.slot === slot
    )
  }

  function handleDateClick(arg: DateClickArg) {
    if (isPastReservationDate(arg.dateStr)) return
    setDayPanel(dayPanel === arg.dateStr ? null : arg.dateStr)
    setError('')
  }

  function openBookModal(date: string, slot: Slot) {
    setError('')
    setModal({ type: 'book', date, slot })
  }

  function openDetailModal(reservation: Reservation) {
    setError('')
    setModal({ type: 'detail', reservation })
  }

  async function handleSignIn() {
    const supabase = getSupabaseBrowser()
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) {
      setAuthError('メールアドレスを入力してください')
      return
    }

    if (!isAllowedSchoolEmail(normalizedEmail)) {
      setAuthError('校内メールアドレスでログインしてください')
      return
    }

    setAuthLoading(true)
    setAuthError('')
    setAuthMessage('')

    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: window.location.origin,
      },
    })

    setAuthLoading(false)

    if (signInError) {
      setAuthError(signInError.message)
      return
    }

    setAuthMessage('ログインリンクを送信しました。メールを確認してください。')
  }

  async function handleSignOut() {
    const supabase = getSupabaseBrowser()
    setAuthLoading(true)
    setAuthError('')
    setAuthMessage('')
    await supabase.auth.signOut()
    setAuthLoading(false)
  }

  async function handleCreate() {
    if (modal.type !== 'book' || !sessionToken) return
    const reservationName = userEmail ? getReservationDisplayName(userEmail) : ''
    if (!reservationName) {
      setError('ログイン中のメールアドレスを確認できません')
      return
    }

    setLoading(true)
    setError('')

    const res = await fetch('/api/reservations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({ date: modal.date, slot: modal.slot, name: reservationName }),
    })
    const data = await res.json().catch(() => null)
    setLoading(false)

    if (!res.ok) {
      setError(data?.error ?? 'エラーが発生しました')
      return
    }

    setModal({ type: 'closed' })
    setDayPanel(null)
    await fetchReservations(sessionToken).catch((fetchError) => {
      setAuthError(fetchError instanceof Error ? fetchError.message : '予約の取得に失敗しました')
    })
  }

  async function handleDelete() {
    if (modal.type !== 'detail' || !sessionToken) return
    if (!confirm('この予約を削除しますか？')) return

    setLoading(true)
    setError('')

    const res = await fetch(`/api/reservations/${modal.reservation.id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
    })
    const data = await res.json().catch(() => null)
    setLoading(false)

    if (!res.ok) {
      setError(data?.error ?? '削除に失敗しました')
      return
    }

    setModal({ type: 'closed' })
    await fetchReservations(sessionToken).catch((fetchError) => {
      setAuthError(fetchError instanceof Error ? fetchError.message : '予約の取得に失敗しました')
    })
  }

  function formatDate(dateStr: string) {
    const date = new Date(`${dateStr}T00:00:00`)
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short',
    })
  }

  const slotBg: Record<Slot, string> = {
    昼: 'bg-amber-400',
    放課後: 'bg-blue-500',
  }

  const slotCard: Record<Slot, string> = {
    昼: 'bg-amber-50 border border-amber-200',
    放課後: 'bg-blue-50 border border-blue-200',
  }

  const slotBtn: Record<Slot, string> = {
    昼: 'bg-amber-400 active:bg-amber-500',
    放課後: 'bg-blue-500 active:bg-blue-600',
  }

  if (booting) {
    return (
      <div className="mx-auto flex min-h-screen max-w-2xl items-center justify-center px-6">
        <p className="text-sm text-gray-500">認証状態を確認しています...</p>
      </div>
    )
  }

  if (!sessionToken) {
    return (
      <div className="mx-auto flex min-h-screen max-w-2xl items-center px-4 py-10">
        <div className="w-full rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold text-blue-600">校内アカウント限定</p>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">理科講義室 予約システム</h1>
          <p className="mt-3 text-sm leading-6 text-gray-600">
            閲覧・予約には校内メールアドレスでのログインが必要です。
            {ALLOWED_EMAIL_DOMAINS.length > 0 &&
              ` 許可ドメイン: ${ALLOWED_EMAIL_DOMAINS.map((domain) => `@${domain}`).join(', ')}`}
          </p>
          <div className="mt-6 space-y-3">
            <label className="block text-sm font-medium text-gray-700">校内メールアドレス</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                  void handleSignIn()
                }
              }}
              placeholder="example@school.ac.jp"
              className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoComplete="email"
            />
            {authError && <p className="text-sm text-red-500">{authError}</p>}
            {authMessage && <p className="text-sm text-emerald-600">{authMessage}</p>}
            <button
              onClick={() => void handleSignIn()}
              disabled={authLoading}
              className="w-full rounded-2xl bg-gray-900 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {authLoading ? '送信中...' : 'ログインリンクを送る'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white px-4 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-gray-900">理科講義室の予約システム</h1>
            <p className="mt-0.5 text-xs text-gray-500">使いたい日をタップして予約できます</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">{userEmail}</p>
            <button
              onClick={() => void handleSignOut()}
              disabled={authLoading}
              className="mt-1 text-xs font-semibold text-gray-700 underline underline-offset-2 disabled:opacity-50"
            >
              ログアウト
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl space-y-4 px-2 py-4">
        {authError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {authError}
          </div>
        )}

        <div className="flex gap-4 px-2">
          <span className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400" />
            昼
          </span>
          <span className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-500" />
            放課後
          </span>
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-400" />
            空き
          </span>
        </div>

        <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
          <FullCalendar
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            locale="ja"
            dateClick={handleDateClick}
            height="auto"
            headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
            buttonText={{ today: '今日' }}
            dayCellContent={(arg) => {
              const date = arg.date
              const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
              const isPast = isPastReservationDate(dateStr)
              const reservationList = reservationsForDate(dateStr)
              const isSelected = dayPanel === dateStr

              return (
                <div
                  className={`h-full min-h-[60px] w-full px-0.5 pb-1 pt-1 transition-colors sm:min-h-[80px] ${
                    isSelected ? 'bg-blue-50' : ''
                  } ${isPast ? 'opacity-40' : ''}`}
                >
                  <div
                    className={`mb-1 pr-0.5 text-right text-xs font-medium ${
                      isSelected ? 'text-blue-600' : 'text-gray-500'
                    }`}
                  >
                    {arg.date.getDate()}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {SLOTS.map((slot) => {
                      const reservation = reservationList.find((value) => value.slot === slot)
                      const label = slot === '昼' ? '昼' : '放'

                      return (
                        <div
                          key={slot}
                          className={`truncate rounded px-1 py-[3px] text-[8px] font-bold leading-none sm:text-[10px] ${
                            reservation
                              ? `${slotBg[slot]} text-white`
                              : 'bg-gray-100 text-gray-400'
                          }`}
                        >
                          {reservation ? `${label} ${reservation.name}` : `${label} 空き`}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            }}
            dayCellClassNames={(arg) => {
              const dateStr = `${arg.date.getFullYear()}-${String(arg.date.getMonth() + 1).padStart(2, '0')}-${String(arg.date.getDate()).padStart(2, '0')}`

              return isPastReservationDate(dateStr)
                ? ['cursor-default']
                : ['cursor-pointer', 'transition-colors', 'hover:bg-blue-50/50']
            }}
          />
        </div>

        {dayPanel && (
          <div ref={panelRef} className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-800">{formatDate(dayPanel)}</h2>
              <button
                onClick={() => setDayPanel(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-lg leading-none text-gray-400 hover:bg-gray-100"
              >
                ×
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {SLOTS.map((slot) => {
                const reservation = slotReservation(dayPanel, slot)
                return (
                  <div key={slot} className={`rounded-xl p-4 ${slotCard[slot]}`}>
                    <div className="mb-3 flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${slotBg[slot]}`} />
                      <span className="text-sm font-bold text-gray-800">{slot}</span>
                      {reservation && (
                        <span
                          className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold text-white ${slotBg[slot]}`}
                        >
                          予約済み
                        </span>
                      )}
                    </div>
                    {reservation ? (
                      <div className="flex items-center justify-between">
                        <p className="text-base font-semibold text-gray-800">{reservation.name}</p>
                        {reservation.canDelete && (
                          <button
                            onClick={() => openDetailModal(reservation)}
                            className="ml-2 text-xs text-gray-400 underline underline-offset-2 hover:text-red-500"
                          >
                            削除
                          </button>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => openBookModal(dayPanel, slot)}
                        className={`w-full rounded-xl py-2.5 text-sm font-semibold text-white transition-opacity active:opacity-80 ${slotBtn[slot]}`}
                      >
                        予約する
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="h-4" />
      </div>

      {modal.type === 'book' && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={() => setModal({ type: 'closed' })}
        >
          <div
            className="w-full rounded-t-3xl bg-white p-6 shadow-2xl sm:max-w-sm sm:rounded-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-gray-200 sm:hidden" />
            <div className="mb-1 flex items-center gap-2">
              <span className={`h-3 w-3 rounded-full ${slotBg[modal.slot]}`} />
              <h2 className="text-lg font-bold text-gray-800">{modal.slot}の予約</h2>
            </div>
            <p className="mb-5 text-sm text-gray-500">{formatDate(modal.date)}</p>
            {error && <p className="mb-3 text-sm text-red-500">{error}</p>}
            <div className="mt-2 flex gap-3">
              <button
                onClick={() => setModal({ type: 'closed' })}
                className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-medium text-gray-600 active:bg-gray-50"
              >
                キャンセル
              </button>
              <button
                onClick={() => void handleCreate()}
                disabled={loading}
                className={`flex-1 rounded-xl py-3 text-sm font-bold text-white disabled:opacity-50 active:opacity-80 ${slotBtn[modal.slot]}`}
              >
                {loading ? '予約中...' : '予約する'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal.type === 'detail' && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={() => setModal({ type: 'closed' })}
        >
          <div
            className="w-full rounded-t-3xl bg-white p-6 shadow-2xl sm:max-w-sm sm:rounded-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-gray-200 sm:hidden" />
            <div className="mb-1 flex items-center gap-2">
              <span className={`h-3 w-3 rounded-full ${slotBg[modal.reservation.slot]}`} />
              <h2 className="text-lg font-bold text-gray-800">{modal.reservation.slot}の予約</h2>
            </div>
            <p className="mb-5 text-sm text-gray-500">{formatDate(modal.reservation.date)}</p>
            <div className="mb-5 rounded-xl bg-gray-50 px-4 py-3">
              <span className="text-xs text-gray-400">予約者</span>
              <p className="mt-0.5 text-lg font-semibold text-gray-800">
                {modal.reservation.name}
              </p>
            </div>
            {error && <p className="mb-3 text-sm text-red-500">{error}</p>}
            <div className="flex gap-3">
              <button
                onClick={() => setModal({ type: 'closed' })}
                className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-medium text-gray-600 active:bg-gray-50"
              >
                閉じる
              </button>
              <button
                onClick={() => void handleDelete()}
                disabled={loading}
                className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-bold text-white disabled:opacity-50 active:opacity-80"
              >
                {loading ? '削除中...' : '予約を削除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
