# Complaints Triage & Attachments — Design Addendum

Extends `docs/superpowers/specs/2026-09-08-complaints-module-design.md` after initial launch feedback. Covers: three UI fixes to the already-shipped dashboard/submission page, and two new capabilities (status/comment triage, photo attachments) that were explicitly deferred in the original spec.

## UI Fixes (no schema change)

1. **Category chart label size bug.** `ComplaintsCategoryChart.tsx` renders bars/labels as raw SVG inside a `viewBox` narrower than the rendered container width. The browser scales the whole coordinate system (including `<text>` font-size) to fill the container, so a `text-xs` (12px) label renders visibly larger than 12px whenever the card is wider than the chart's internal 500-unit coordinate space. Fix: rebuild as a plain HTML/CSS bar list (flex rows, a background-track div + a width-percentage fill div), removing the SVG scaling issue entirely and matching the rest of this app's non-SVG UI.

2. **Detail view should be a modal.** `ComplaintsList.tsx` currently expands a complaint's full text in place inside a `max-w-md` table cell — cramped, and not what a reviewer expects when clicking a row. Fix: clicking a row opens a `Dialog` (this codebase's existing `@/components/ui/dialog`) showing date, category, submitter name (or "Anónima"), and the full message. The table itself goes back to always showing only the truncated preview.

3. **Submission form is too small.** `NewComplaintForm.tsx`/`nueva/page.tsx` cap out at `max-w-xl` with small type. Fix: widen the container (`max-w-3xl`), increase heading/label/button text sizes, and give the message textarea more visible rows.

## Triage: ticket number, status, reviewer comment

**Schema additions to `complaints`:**
- `complaint_number bigint generated always as identity` — a stable, auto-incrementing reference number for ordering/citing a complaint. Not tied to date or category, purely insertion order.
- `status text not null default 'nuevo' check (status in ('nuevo', 'en_proceso', 'resuelto'))` — matches the three states named in the original spec's "out of scope, deferred" note.
- `reviewer_comment text` — nullable, free text, for the viewer's internal notes.

**Why this needs a new function, not a plain UPDATE policy:** `complaints` deliberately has zero UPDATE/DELETE policies today — verified by an explicit integration test ("direct update/delete against complaints is rejected for everyone"). That guarantee stays in place for `message`/`category`/`is_anonymous`/`contact_id`/`photo_path` — none of those should ever be editable after submission. A new `security definer` function, `update_complaint_status(p_id uuid, p_status text, p_comment text)`, is added instead: gated by `can_view_complaints()`, and its `update` statement only ever touches `status` and `reviewer_comment`. This keeps the "the original complaint is immutable" guarantee intact while giving viewers a real, bounded way to triage.

**Display:** the dashboard list shows `#<complaint_number>` per row, a status `Badge` (color-coded: nuevo=default, en_proceso=outline/amber, resuelto=green-ish via className override, matching this codebase's existing "no built-in success/warning variant, use className overrides" convention), and the detail Dialog gets a status `Select` + a comment `Textarea` + a "Guardar" button calling the new RPC.

## Photo attachments

**Schema addition:** `complaints.photo_path text` — nullable, a single optional photo per complaint (not a separate attachments table; YAGNI for "a photo", singular, per the request).

**Storage:** a new **private** bucket `complaint-photos`, with **zero** `storage.objects` policies — mirroring `maintenance-signatures`/`maintenance-reports` (`20260728100300_maintenance_storage_buckets.sql`), which documents exactly this reasoning: "RLS enabled by default with zero policies... denies all access to anon/authenticated roles... every read and write goes through the service-role admin client." This is the load-bearing anonymity decision: if the browser uploaded directly using the submitter's own session (like `PlatformLogoForm.tsx`/`document-stamps` do), Supabase Storage would tag the object's `owner` with the real submitter's `auth.uid()` even when `is_anonymous = true` — a real deanonymization vector that would silently undermine the whole "anónima de verdad" guarantee. Instead:

- The submission Server Action uploads the file using `createAdminClient()` (service role), regardless of whether the complaint itself is anonymous or named — one code path, no branching that could accidentally regress.
- `submit_complaint()` grows an optional `p_photo_path text default null` parameter, stored as-is (it's just a storage path string, never derived from or containing the uploader's identity — the path is a random UUID-based key, not the user's id or email).
- On the review dashboard, an attached photo is shown via a **signed URL** generated server-side (also via the admin client) at page-render time, since the bucket has no public read access either — the existing `can_view_complaints()` gate on `/quejas/page.tsx` is what authorizes seeing it at all.
- Client-side: a single optional `<input type="file" accept="image/*">` in `NewComplaintForm.tsx`. Basic guardrails: image MIME types only, a reasonable size cap (5 MB) enforced both client-side (immediate feedback) and in the Server Action (authoritative).

## Testing

- `update_complaint_status`: a viewer can update status/comment; a non-viewer cannot; a direct `update` on `complaints` (bypassing the function) for `status`/`reviewer_comment` is still rejected (no blanket UPDATE policy was added); updating any other column via the function is not possible (the function's SQL doesn't accept them).
- Photo upload: the Server Action correctly resolves and stores a `photo_path` for both anonymous and named submissions with no difference in code path; a complaint with no uploaded photo has `photo_path = null` and the dashboard doesn't attempt a signed URL for it.

## Out of scope (unchanged from original + new)

- Multiple photos per complaint.
- Email notification when a complaint's status changes.
- A history/audit trail of status changes (only the current status/comment is kept).
