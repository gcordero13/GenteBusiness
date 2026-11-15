-- Lets an admin toggle a festive, purely decorative overlay (falling snow +
-- a string-lights garland) across the whole app from Settings. No other
-- styling changes anywhere - confirmed with the user, who wanted an
-- overlay only, never a reskin of existing colors/buttons.
alter table public.platform_settings
  add column christmas_mode_enabled boolean not null default false;
