alter table public.reading_shelves drop constraint reading_shelves_color_check;
alter table public.reading_shelves add constraint reading_shelves_color_check check (color in ('primary', 'accent', 'textSecondary') or color ~* '^#[0-9a-f]{6}$');
