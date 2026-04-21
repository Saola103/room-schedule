'use client'

import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import { DateClickArg } from '@fullcalendar/interaction'
import { useState, useEffect, useCallback } from 'react'
import type { Reservation, Slot } from '@/lib/supabase'
import { SLOTS } from '@/lib/supabase'

type ModalState =
  | { type: 'closed' }
  | { type: 'book'; date: string; slot: Slot }
  | { type: 'detail'; reservation: Reservation }

export default function ReservationCalendar() {
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [modal, setModal] = useState<ModalState>({ type: 'closed' })
  const [dayPanel, setDayPanel] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fetchReservations = useCallback(async () => {
    const res = await fetch('/api/reservations')
    const data = await res.json()
    if (Array.isArray(data)) setReservations(data)
  }, [])

  useEffect(() => { fetchReservations() }, [fetchReservations])

  function reservationsForDate(date: string) {
    return reservations.filter((r) => r.date === date)
  }

  function slotReservation(date: string, slot: Slot) {
    return reservations.find((r) => r.date === date && r.slot === slot)
  }

  function handleDateClick(arg: DateClickArg) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (new Date(arg.dateStr) < today) return
    setDayPanel(dayPanel === arg.dateStr ? null : arg.dateStr)
    setError('')
  }

  function openBookModal(date: string, slot: Slot) {
    setName('')
    setError('')
    setModal({ type: 'book', date, slot })
  }

  function openDetailModal(r: Reservation) {
    setModal({ type: 'detail', reservation: r })
  }

  async function handleCreate() {
    if (modal.type !== 'book') return
    if (!name.trim()) { setError('名前を入力してください'); return }
    setLoading(true)
    setError('')
    const res = await fetch('/api/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: modal.date, slot: modal.slot, name: name.trim() }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error ?? 'エラーが発生しました'); return }
    setModal({ type: 'closed' })
    setDayPanel(null)
    fetchReservations()
  }

  async function handleDelete() {
    if (modal.type !== 'detail') return
    if (!confirm('この予約を削除しますか？')) return
    setLoading(true)
    await fetch(`/api/reservations/${modal.reservation.id}`, { method: 'DELETE' })
    setLoading(false)
    setModal({ type: 'closed' })
    fetchReservations()
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })
  }

  const slotColor: Record<Slot, string> = {
    '昼': 'bg-amber-400',
    '放課後': 'bg-blue-500',
  }
  const slotLightColor: Record<Slot, string> = {
    '昼': 'bg-amber-50 border-amber-200 text-amber-700',
    '放課後': 'bg-blue-50 border-blue-200 text-blue-700',
  }

  const events = reservations.map((r) => ({
    id: r.id,
    title: `${r.slot}: ${r.name}`,
    date: r.date,
    backgroundColor: r.slot === '昼' ? '#f59e0b' : '#3b82f6',
    borderColor: r.slot === '昼' ? '#f59e0b' : '#3b82f6',
    extendedProps: { reservation: r },
    display: 'none',
  }))

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-1">理科講義室 予約</h1>
        <p className="text-sm text-gray-500 mb-2">使いたい日をクリックして予約できます</p>
        <div className="flex gap-3 mb-6">
          <span className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="w-3 h-3 rounded-full bg-amber-400 inline-block" />昼
          </span>
          <span className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />放課後
          </span>
          <span className="flex items-center gap-1.5 text-xs text-gray-400">
            <span className="w-3 h-3 rounded-full bg-gray-300 inline-block" />埋まり
          </span>
        </div>

        <FullCalendar
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          locale="ja"
          events={events}
          dateClick={handleDateClick}
          height="auto"
          headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
          buttonText={{ today: '今日' }}
          dayCellContent={(arg) => {
            const dateStr = arg.date.toISOString().split('T')[0]
            const today = new Date(); today.setHours(0, 0, 0, 0)
            const isPast = arg.date < today
            const rList = reservationsForDate(dateStr)

            return (
              <div className={`w-full p-1 ${isPast ? 'opacity-40' : ''}`}>
                <div className="text-right text-xs text-gray-500 mb-1">{arg.date.getDate()}</div>
                <div className="space-y-0.5">
                  {SLOTS.map((slot) => {
                    const r = rList.find((x) => x.slot === slot)
                    return (
                      <div
                        key={slot}
                        className={`text-[10px] px-1.5 py-0.5 rounded font-medium truncate leading-tight ${
                          r
                            ? slot === '昼'
                              ? 'bg-amber-400 text-white'
                              : 'bg-blue-500 text-white'
                            : isPast
                            ? 'bg-gray-100 text-gray-400'
                            : 'bg-gray-100 text-gray-400'
                        }`}
                      >
                        {slot}: {r ? r.name : '空き'}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          }}
          dayCellClassNames={(arg) => {
            const today = new Date(); today.setHours(0, 0, 0, 0)
            return arg.date < today ? ['cursor-default'] : ['cursor-pointer', 'hover:bg-blue-50', 'transition-colors']
          }}
        />
      </div>

      {/* Day panel */}
      {dayPanel && (
        <div className="mt-4 bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">{formatDate(dayPanel)}</h2>
          <div className="grid grid-cols-2 gap-4">
            {SLOTS.map((slot) => {
              const r = slotReservation(dayPanel, slot)
              return (
                <div key={slot} className={`rounded-xl border p-4 ${slotLightColor[slot]}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`w-2.5 h-2.5 rounded-full ${slotColor[slot]}`} />
                    <span className="font-bold text-sm">{slot}</span>
                  </div>
                  {r ? (
                    <>
                      <p className="text-base font-semibold text-gray-800 mb-3">{r.name}</p>
                      <button
                        onClick={() => openDetailModal(r)}
                        className="text-xs text-gray-500 underline underline-offset-2 hover:text-red-500"
                      >
                        詳細・削除
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-gray-400 mb-3">空き</p>
                      <button
                        onClick={() => openBookModal(dayPanel, slot)}
                        className={`w-full py-1.5 rounded-lg text-sm font-medium text-white transition-colors ${
                          slot === '昼' ? 'bg-amber-400 hover:bg-amber-500' : 'bg-blue-500 hover:bg-blue-600'
                        }`}
                      >
                        予約する
                      </button>
                    </>
                  )}
                </div>
              )
            })}
          </div>
          <button
            onClick={() => setDayPanel(null)}
            className="mt-4 text-xs text-gray-400 hover:text-gray-600"
          >
            閉じる
          </button>
        </div>
      )}

      {/* Book modal */}
      {modal.type === 'book' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setModal({ type: 'closed' })}>
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-3 h-3 rounded-full ${slotColor[modal.slot]}`} />
              <h2 className="text-xl font-bold text-gray-800">{modal.slot}の予約</h2>
            </div>
            <p className="text-sm text-gray-500 mb-6">{formatDate(modal.date)}</p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                名前 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                placeholder="例: 山田太郎"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
            {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
            <div className="flex gap-3">
              <button onClick={() => setModal({ type: 'closed' })} className="flex-1 border border-gray-300 rounded-lg py-2 text-sm text-gray-700 hover:bg-gray-50">
                キャンセル
              </button>
              <button
                onClick={handleCreate}
                disabled={loading}
                className={`flex-1 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50 transition-colors ${
                  modal.slot === '昼' ? 'bg-amber-400 hover:bg-amber-500' : 'bg-blue-500 hover:bg-blue-600'
                }`}
              >
                {loading ? '予約中...' : '予約する'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {modal.type === 'detail' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setModal({ type: 'closed' })}>
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-3 h-3 rounded-full ${slotColor[modal.reservation.slot]}`} />
              <h2 className="text-xl font-bold text-gray-800">{modal.reservation.slot}の予約</h2>
            </div>
            <p className="text-sm text-gray-500 mb-6">{formatDate(modal.reservation.date)}</p>
            <div className="mb-6">
              <span className="text-xs text-gray-400 uppercase tracking-wide">名前</span>
              <p className="text-lg font-semibold text-gray-800">{modal.reservation.name}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setModal({ type: 'closed' })} className="flex-1 border border-gray-300 rounded-lg py-2 text-sm text-gray-700 hover:bg-gray-50">
                閉じる
              </button>
              <button onClick={handleDelete} disabled={loading} className="flex-1 bg-red-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-red-600 disabled:opacity-50">
                {loading ? '削除中...' : '削除する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
