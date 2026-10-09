-- 0010: the blue-and-white "Universal" look becomes the default appearance.
--
-- The theme id stays 'liquid-glass' (it is the stored id of the default theme), so no constraint
-- changes are needed. New accounts start in light mode with the blue accent. Existing accounts that
-- never changed their appearance (still exactly on the old defaults) are moved to the new defaults;
-- anyone who picked their own theme, colour mode or accent keeps it.

alter table public.user_preferences alter column color_mode set default 'light';
alter table public.user_preferences alter column accent_color set default '#2563eb';

update public.user_preferences
   set color_mode = 'light', accent_color = '#2563eb'
 where theme = 'liquid-glass'
   and color_mode = 'system'
   and lower(accent_color) = '#7c8cff';
