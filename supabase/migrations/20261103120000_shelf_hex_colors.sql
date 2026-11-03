-- Idempotent: also repairs databases where 20261015110000_shelf_icon_colors was never applied.
alter table public.reading_shelves drop constraint if exists reading_shelves_color_check;
alter table public.reading_shelves add constraint reading_shelves_color_check check (color in ('primary', 'accent', 'textSecondary') or color ~* '^#[0-9a-f]{6}$');
alter table public.reading_shelves alter column color set default '#3a62b0';
