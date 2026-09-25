-- Brand name, page-title separator, and homepage slogan are fixed by the site.
-- Remove the obsolete admin-managed values after clients stopped reading them.
DELETE FROM public.settings
WHERE key IN ('brand_name', 'title_separator', 'brand_slogan');
