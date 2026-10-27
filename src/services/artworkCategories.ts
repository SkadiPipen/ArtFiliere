import catalogue from '../../shared/artwork_categories.json';

export const ARTWORK_CATEGORIES = catalogue.categories;
export const MAX_ARTWORK_CATEGORIES = catalogue.max_categories;
export const CATEGORY_SOURCE = catalogue.source;
export const CATEGORY_FILTERS = ['All', ...ARTWORK_CATEGORIES.map(category => category.label)];
const normalize = (value: string) => value.trim().toLowerCase().replace(/[_-]/g, ' ');
const aliases = new Map(ARTWORK_CATEGORIES.flatMap(category => [category.id, category.label, ...category.aliases].map(label => [normalize(label), category.id] as const)));
export const categoryLabel = (id: string) => ARTWORK_CATEGORIES.find(category => category.id === id)?.label || id;

type CategorizedArtwork = { categories?: string[]; category?: string; type?: string; artType?: string; art_type?: string };
export function artworkCategoryIds(work: CategorizedArtwork): string[] {
  const stored = work.categories?.filter(id => ARTWORK_CATEGORIES.some(category => category.id === id));
  if (stored?.length) return stored;
  const legacy = aliases.get(normalize(work.category || work.type || ''));
  return legacy ? [legacy] : [];
}

export function matchesArtworkCategory(work: CategorizedArtwork, filter: string) {
  if (['All', 'Trending'].includes(filter)) return true;
  if (['Digital', 'Physical'].includes(filter)) return normalize(work.artType || work.art_type || work.type || '') === filter.toLowerCase();
  const id = aliases.get(normalize(filter));
  return id ? artworkCategoryIds(work).includes(id) : normalize(work.category || work.type || '') === normalize(filter);
}
