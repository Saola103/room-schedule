export const SLOTS = ['昼', '放課後'] as const

export type Slot = (typeof SLOTS)[number]

export type Reservation = {
  id: string
  date: string
  slot: Slot
  name: string
  created_at: string
  canDelete: boolean
}

export const MAX_NAME_LENGTH = 40

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f]/g

export function normalizeName(value: string) {
  return value
    .normalize('NFKC')
    .replace(CONTROL_CHAR_PATTERN, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isValidSlot(slot: string): slot is Slot {
  return SLOTS.includes(slot as Slot)
}

export function isValidReservationId(id: string) {
  return UUID_PATTERN.test(id)
}

export function isValidDateString(value: string) {
  if (!DATE_PATTERN.test(value)) return false

  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return false

  return date.toISOString().slice(0, 10) === value
}

export function getTodayInTokyo() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())

  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  return `${year}-${month}-${day}`
}

export function isPastReservationDate(value: string) {
  return value < getTodayInTokyo()
}

export function getReservationDisplayName(email: string) {
  const normalized = email.trim().toLowerCase()
  const [localPart] = normalized.split('@')
  return localPart || normalized
}

export function validateReservationPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return { ok: false as const, error: '不正なリクエストです' }
  }

  const rawDate = Reflect.get(payload, 'date')
  const rawSlot = Reflect.get(payload, 'slot')
  const rawName = Reflect.get(payload, 'name')

  if (
    typeof rawDate !== 'string' ||
    typeof rawSlot !== 'string' ||
    typeof rawName !== 'string'
  ) {
    return { ok: false as const, error: '日付・時間帯・名前は必須です' }
  }

  const name = normalizeName(rawName)
  if (!name) {
    return { ok: false as const, error: '名前を入力してください' }
  }

  if (name.length > MAX_NAME_LENGTH) {
    return {
      ok: false as const,
      error: `名前は${MAX_NAME_LENGTH}文字以内で入力してください`,
    }
  }

  if (!isValidDateString(rawDate)) {
    return { ok: false as const, error: '日付の形式が不正です' }
  }

  if (isPastReservationDate(rawDate)) {
    return { ok: false as const, error: '過去の日付は予約できません' }
  }

  if (!isValidSlot(rawSlot)) {
    return {
      ok: false as const,
      error: '時間帯は「昼」か「放課後」のみです',
    }
  }

  return {
    ok: true as const,
    value: {
      date: rawDate,
      slot: rawSlot,
      name,
    },
  }
}
