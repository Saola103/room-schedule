## Auth choice

This app now assumes `Supabase Auth` for school-email login.

- `better-auth` was not chosen because this repo already uses Supabase and the goal was to harden quickly without adding a second auth stack.
- API access expects a Supabase access token in `Authorization: Bearer ...`.
- Reservation data is no longer intended to be public.

## Environment variables

Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ALLOWED_EMAIL_DOMAINS=school.ac.jp
NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS=school.ac.jp
RESERVATION_ADMIN_EMAILS=teacher1@school.ac.jp,teacher2@school.ac.jp
```

Notes:

- `ALLOWED_EMAIL_DOMAINS`: server-side enforcement for API access.
- `NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS`: client-side UX validation only.
- `RESERVATION_ADMIN_EMAILS`: users allowed to delete reservations.

## Database hardening

Run one of these in Supabase SQL Editor:

- Fresh setup: [supabase-setup.sql](/Users/subaru/Desktop/学校/room-schedule/supabase-setup.sql)
- Existing project: [supabase-hardening.sql](/Users/subaru/Desktop/学校/room-schedule/supabase-hardening.sql)

These scripts remove the old anonymous policies so the table is no longer publicly readable or writable.

## Development

```bash
npm install --cache /tmp/room-schedule-npm-cache
npm run dev
```

Open `http://localhost:3000`.
