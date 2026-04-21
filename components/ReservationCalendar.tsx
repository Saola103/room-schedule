'use client'

import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import { DateClickArg } from '@fullcalendar/interaction'
import { useState, useEffect, useCallback, useRef } from 'react'
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
  const panelRef = useRef<HTMLDivElement>(null)

  const fetchReservations = useCallback(async () => {
    const res = await fetch('/api/reservations')
    const data = await res.json()
    if (Array.isArray(data)) setReservations(data)
  }, [])

  useEffect(() => { fetchReservations() }, [fetchReservations])

  // パネルが開いたらスクロール
  useEffect(() => {
    if (dayPanel && panelRef.current) {
      setTimeout(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50)
    }
  }, [dayPanel])

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

  const slotBg: Record<Slot, string> = {
    '昼': 'bg-amber-400',
    '放課後': 'bg-blue-500',
  }
  const slotCard: Record<Slot, string> = {
    '昼': 'bg-amber-50 border border-amber-200',
    '放課後': 'bg-blue-50 border border-blue-200',
  }
  const slotBtn: Record<Slot, string> = {
    '昼': 'bg-amber-400 active:bg-amber-500',
    '放課後': 'bg-blue-500 active:bg-blue-600',
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-white border-b border-gray-200 px-4 py-4 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-lg font-bold text-gray-900">理科講義室の予約システム</h1>
          <p className="text-xs text-gray-500 mt-0.5">使いたい日をタップして予約できます</p>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-2 py-4 space-y-4">
        {/* 凡例 */}
        <div className="flex gap-4 px-2">
          <span className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />昼
          </span>
          <span className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />放課後
          </span>
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-2.5 h-2.5 rounded-full bg-gray-400 inline-block" />空き
          </span>
        </div>

        {/* カレンダー */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <FullCalendar
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            locale="ja"
            dateClick={handleDateClick}
            height="auto"
            headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
            buttonText={{ today: '今日' }}
            dayCellContent={(arg) => {
              const d = arg.date
              const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
              const today = new Date(); today.setHours(0, 0, 0, 0)
              const isPast = arg.date < today
              const rList = reservationsForDate(dateStr)
              const isSelected = dayPanel === dateStr

              return (
                <div className={`w-full h-full min-h-[60px] sm:min-h-[80px] px-0.5 pt-1 pb-1 transition-colors ${
                  isSelected ? 'bg-blue-50' : ''
                } ${isPast ? 'opacity-40' : ''}`}>
                  {/* 日付数字 */}
                  <div className={`text-right text-xs font-medium mb-1 pr-0.5 ${
                    isSelected ? 'text-blue-600' : 'text-gray-500'
                  }`}>
                    {arg.date.getDate()}
                  </div>
                  {/* スロットインジケーター */}
                  <div className="flex flex-col gap-0.5">
                    {SLOTS.map((slot) => {
                      const r = rList.find((x) => x.slot === slot)
                      const label = slot === '昼' ? '昼' : '放'
                      return (
                        <div key={slot} className={`rounded text-[8px] sm:text-[10px] font-bold leading-none px-1 py-[3px] truncate ${
                          r
                            ? `${slotBg[slot]} text-white`
                            : 'bg-gray-100 text-gray-400'
                        }`}>
                          {r ? `${label} ${r.name}` : `${label} 空き`}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            }}
            dayCellClassNames={(arg) => {
              const today = new Date(); today.setHours(0, 0, 0, 0)
              return arg.date < today
                ? ['cursor-default']
                : ['cursor-pointer', 'hover:bg-blue-50/50', 'transition-colors']
            }}
          />
        </div>

        {/* 日付パネル */}
        {dayPanel && (
          <div ref={panelRef} className="bg-white rounded-2xl shadow-sm p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-gray-800">{formatDate(dayPanel)}</h2>
              <button
                onClick={() => setDayPanel(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 text-lg leading-none"
              >
                ×
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {SLOTS.map((slot) => {
                const r = slotReservation(dayPanel, slot)
                return (
                  <div key={slot} className={`rounded-xl p-4 ${slotCard[slot]}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`w-2.5 h-2.5 rounded-full ${slotBg[slot]}`} />
                      <span className="font-bold text-sm text-gray-800">{slot}</span>
                      {r && (
                        <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full text-white ${slotBg[slot]}`}>
                          予約済み
                        </span>
                      )}
                    </div>
                    {r ? (
                      <div className="flex items-center justify-between">
                        <p className="text-base font-semibold text-gray-800">{r.name}</p>
                        <button
                          onClick={() => openDetailModal(r)}
                          className="text-xs text-gray-400 hover:text-red-500 underline underline-offset-2 ml-2"
                        >
                          削除
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => openBookModal(dayPanel, slot)}
                        className={`w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity active:opacity-80 ${slotBtn[slot]}`}
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

        {/* 余白 */}
        <div className="h-4" />
      </div>

      {/* 予約モーダル（スマホ: ボトムシート / PC: センター） */}
      {modal.type === 'book' && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center"
          onClick={() => setModal({ type: 'closed' })}
        >
          <div
            className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl shadow-2xl p-6 pb-safe"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ハンドルバー（スマホのみ） */}
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5 sm:hidden" />
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-3 h-3 rounded-full ${slotBg[modal.slot]}`} />
              <h2 className="text-lg font-bold text-gray-800">{modal.slot}の予約</h2>
            </div>
            <p className="text-sm text-gray-500 mb-5">{formatDate(modal.date)}</p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                名前 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && handleCreate()}
                placeholder="例: 山田太郎"
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
            {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
            <div className="flex gap-3 mt-2">
              <button
                onClick={() => setModal({ type: 'closed' })}
                className="flex-1 border border-gray-200 rounded-xl py-3 text-sm font-medium text-gray-600 active:bg-gray-50"
              >
                キャンセル
              </button>
              <button
                onClick={handleCreate}
                disabled={loading}
                className={`flex-1 text-white rounded-xl py-3 text-sm font-bold disabled:opacity-50 active:opacity-80 ${slotBtn[modal.slot]}`}
              >
                {loading ? '予約中...' : '予約する'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 詳細モーダル（スマホ: ボトムシート / PC: センター） */}
      {modal.type === 'detail' && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center"
          onClick={() => setModal({ type: 'closed' })}
        >
          <div
            className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl shadow-2xl p-6 pb-safe"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5 sm:hidden" />
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-3 h-3 rounded-full ${slotBg[modal.reservation.slot]}`} />
              <h2 className="text-lg font-bold text-gray-800">{modal.reservation.slot}の予約</h2>
            </div>
            <p className="text-sm text-gray-500 mb-5">{formatDate(modal.reservation.date)}</p>
            <div className="bg-gray-50 rounded-xl px-4 py-3 mb-5">
              <span className="text-xs text-gray-400">予約者</span>
              <p className="text-lg font-semibold text-gray-800 mt-0.5">{modal.reservation.name}</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setModal({ type: 'closed' })}
                className="flex-1 border border-gray-200 rounded-xl py-3 text-sm font-medium text-gray-600 active:bg-gray-50"
              >
                閉じる
              </button>
              <button
                onClick={handleDelete}
                disabled={loading}
                className="flex-1 bg-red-500 text-white rounded-xl py-3 text-sm font-bold disabled:opacity-50 active:opacity-80"
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
