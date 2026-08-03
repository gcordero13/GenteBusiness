-- Replaces the NPS (0-10 "would you recommend") and puntualidad questions
-- with a direct 1-5 "overall satisfaction" question. Safe to drop the old
-- columns outright: no survey has ever been answered (all rows are still
-- 'pendiente'), so there is no response data to preserve.
alter table public.maintenance_surveys drop column nps_score;
alter table public.maintenance_surveys drop column punctuality_score;
alter table public.maintenance_surveys add column satisfaction_score smallint check (satisfaction_score between 1 and 5);
