-- The Aprendizaje module is now called "Aprende" (user request, 2026-11-27).
-- Only the visible label changes: the key 'aprendizaje' (permissions, routes)
-- stays, so nothing else is affected.
update public.modules set label = 'Aprende' where key = 'aprendizaje';
