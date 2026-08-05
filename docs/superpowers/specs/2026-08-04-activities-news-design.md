# Noticias y Eventos (Actividades) — Design

**Status:** Approved, ready for implementation plan.

## Summary

Admins managing the "Actividades" module can publish richer, time-boxed news/announcement items (e.g. "Mes de la concientización del cáncer de mama"), each optionally illustrated with an uploaded image. Employees see currently-active items as a new, separate card on the Home dashboard.

This is distinct from the existing `company_events` table (single-date holidays/activities shown as a plain list) — news items have a title, a longer description, an optional image, and a date **range** (start/end), since a campaign like breast cancer awareness month runs for weeks, not a single day.

## Data Model

New table `company_news`:

```sql
create table public.company_news (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  image_url text,
  link_url text,
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  constraint company_news_date_range_valid check (end_date >= start_date)
);

alter table public.company_news enable row level security;

create policy "company_news_select_any_authenticated" on public.company_news
for select
using ( auth.uid() is not null );

create policy "company_news_write_platform_managers" on public.company_news
for insert
with check ( coalesce((select can_manage_platform from public.get_my_role_flags()), false) );

create policy "company_news_update_platform_managers" on public.company_news
for update
using ( coalesce((select can_manage_platform from public.get_my_role_flags()), false) )
with check ( coalesce((select can_manage_platform from public.get_my_role_flags()), false) );

create policy "company_news_delete_platform_managers" on public.company_news
for delete
using ( coalesce((select can_manage_platform from public.get_my_role_flags()), false) );
```

This mirrors `company_events`'s existing RLS shape exactly (any authenticated user can read; `can_manage_platform` from `get_my_role_flags()` gates writes), for consistency with the established pattern in this codebase.

A new public storage bucket `news-images` is added, with policies mirroring `contact-photos`' migration (`20260714150108_contact_photos_storage.sql`): public read, insert/update gated by the same manage-platform check used above (not `can_add`/`can_edit`, since news publishing is a platform-manager action, not a per-contact edit), delete gated the same way.

## Admin UI

`/activities` (existing page, module key `activities`) gains a second section below the current días-feriados table: **"Noticias y eventos"**.

- `NewsForm` component (client), modeled on the existing `ActivityForm`: a dialog with `title` (text input), `description` (textarea), an optional image file input (reusing `sanitizeFileName` from `src/lib/storagePath.ts`, same upload flow as `ContactForm`/`CompanyForm`: upload to `news-images`, then `getPublicUrl`), an optional `link_url` text input (plain URL, e.g. "https://..."), and two date inputs (`start_date`, `end_date`). Client-side validation: `end_date >= start_date` (disable submit otherwise, mirroring how the existing form disables submit when required fields are empty).
- A list/table of existing news items (title, date range, edit/delete), same shape as the current activities table, using `DeleteIconButton` for delete like `deleteActivity`.
- New server actions `saveNews`/`deleteNews` in `src/app/(app)/(admin)/activities/actions.ts`, following `saveActivity`/`deleteActivity`'s exact shape (`revalidatePath("/activities")` + `revalidatePath("/")` since news now also appears on Home, instead of `/contacts`).
- Same permission gate as today: page redirects to `/` if `!flags.can_manage` for the `activities` module.

## Dashboard Display

`src/app/(app)/page.tsx` gains a query for **active** news:

```ts
const { data: activeNews } = await supabase
  .from("company_news")
  .select("id, title, description, image_url, link_url, start_date, end_date")
  .lte("start_date", todayIso)
  .gte("end_date", todayIso)
  .order("start_date")
  .limit(5);
```

(`todayIso` is the same business-timezone date string already computed for the events query — see `getBusinessToday()` in `src/lib/contacts.ts`.)

A new `NewsWidget` client component (in `src/app/(app)/contacts/` alongside the other dashboard widgets, or a new `src/app/(app)/news/` folder — implementer's call, following whichever grouping reads more clearly) renders as its **own full-width row below** the existing 3-column `BirthdaysWidget` grid — per the approved layout option, this does not touch the birthday row's column widths at all.

- 0 active items: widget renders nothing (`return null`), same convention as every other widget here.
- 1 active item: static card — image thumbnail (or no thumbnail if `image_url` is null) + title + description + a "Más información" link (only rendered if `link_url` is present, opens in a new tab), styled in the app's existing teal/emerald palette (`border-[#04B1AF]/20`, `bg-[#04B1AF]/5`), not tinted to match the news topic — the uploaded image itself carries that visual identity.
- 2+ active items: same card, rotating through items automatically (interval + `useEffect`, matching the exact pattern already used in `TodayBirthdayCard`/`BirthdaysCoverflow`) with dot navigation to jump directly to an item.

## Data Flow

Home (Server Component) → queries `company_news` filtered by date range → passes plain array of items as a prop to `NewsWidget` (Client Component, only needs client-side state for which item is currently shown in the rotation — no client-side data fetching).

## Error Handling

- Image upload errors surface in the form the same way `ContactForm`/`CompanyForm` do today (`setError(uploadError.message)`), no new pattern needed.
- `end_date < start_date` is rejected both client-side (disabled submit) and at the database level (the `company_news_date_range_valid` check constraint), so a bypassed/buggy client can't produce an invalid range.

## Testing

- A pure helper `isNewsActive(item: { start_date: string; end_date: string }, today: Date): boolean` in `src/lib/contacts.ts` (or a new small `src/lib/news.ts` if it doesn't fit the "contacts" naming — implementer's call), unit-tested the same way `isTodayBirthday`/`splitTodayBirthdays` already are in `contacts.test.ts`: covers before-range, in-range, after-range, and boundary (exactly on `start_date`/`end_date`).
- No integration/RLS test is strictly required for the migration itself (the codebase doesn't have one for `company_events` either), but if the implementer follows precedent from `documentStampsRls.test.ts`/`logosRls.test.ts`, adding one for `company_news` (authenticated read, unauthenticated denied, non-manager write denied) would match the codebase's stronger-tested areas — left as a nice-to-have, not required, to match the existing `company_events` bar.

## Out of Scope

- Rich text formatting for `description` (plain text only, textarea).
- Multiple images per news item (one optional `image_url`).
- Notifications/email when a new news item is published.
- Editing the "active" window after the fact via anything other than changing `start_date`/`end_date` directly (no separate manual show/hide toggle — precedent: date range is the only control, matching the "automatic per date range" decision).
