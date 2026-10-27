const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const catalogue = JSON.parse(fs.readFileSync('shared/artwork_categories.json', 'utf8'));
const api = {};
const code = ts.transpileModule(fs.readFileSync('src/services/artworkCategories.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
vm.runInNewContext(code, { exports: api, require: () => catalogue });
const work = { categories: ['illustration', 'painting', 'collage'], art_type: 'digital', category: 'Illustration' };
assert.equal(api.matchesArtworkCategory(work, 'Painting'), true, 'Secondary categories must match');
assert.equal(api.matchesArtworkCategory(work, 'Collage'), true);
assert.equal(api.matchesArtworkCategory(work, 'Photography'), false);
assert.equal(api.matchesArtworkCategory(work, 'Digital'), true);
assert.equal(api.matchesArtworkCategory(work, 'Physical'), false);
assert.equal(api.matchesArtworkCategory({category:'Oil_Painting'}, 'Painting'), true);
assert.equal(api.matchesArtworkCategory({category:'Portrait',art_type:'digital'}, 'Painting'), false, 'Subject and format are not work types');
assert.equal(api.matchesArtworkCategory({category:'Portrait',art_type:'digital'}, 'All'), true);
assert.equal(api.matchesArtworkCategory({category:'Portrait',art_type:'digital'}, 'Digital'), true);
for (const category of catalogue.categories) {
  assert.ok(api.CATEGORY_FILTERS.includes(category.label));
  assert.equal(api.matchesArtworkCategory({categories:[category.id]},category.label),true);
}
assert.equal(api.MAX_ARTWORK_CATEGORIES,5);
console.log('PASS: all built-in filters, secondary categories, legacy mappings, format separation, and uncategorized visibility.');
