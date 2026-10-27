# Artwork categories

Posting and marketplace filters use `shared/artwork_categories.json`. The backend
validates IDs from the same file; the first selected ID is primary. The existing
`category` string remains as the primary display label for compatibility.
Deploy the `shared` directory alongside `backend` and `src`.

An artwork requires 1–5 distinct work types. Primary is required, secondary types
are optional. There is no default selection: the artist chooses appropriate types.
Descriptive tags and Digital/Physical format are separate metadata.

## Basis and limits

This is a curated marketplace vocabulary, not the entire Getty AAT, an official
Getty classification, or a claim that every possible art form is represented.
Labels and plain-language descriptions are adapted for this marketplace. “Other
Visual Art” is a local fallback, not an attributed Getty term.

- [Getty AAT overview](https://www.getty.edu/research-conservation/tools-databases/vocabularies/)
  provides authoritative, controlled art terminology.
- [Getty CONA work-type guidance](https://www.getty.edu/publications/vocabularies-editorial-guidelines/cona-guidelines/3_editorial_rules/3.6_fields/3.6.1/)
  permits multiple work types, specifies a preferred first type, says most
  individual records use 1–5 types, and discourages more than 10. Five is our
  platform cap, informed by that common range; it is not a Getty-mandated maximum.
- [Getty CDWA Object/Work Type](https://www.getty.edu/publications/categories-description-works-art/categories/object-architecture-group/1/)
  recommends specific appropriate terms and controlled vocabularies.

The migration backfills only recognized historical category labels. It preserves
original strings and leaves ambiguous labels unassigned. For example, “Digital”
does not prove a work is Digital Art, and “Portrait” describes a subject rather
than whether it is a painting, drawing, photograph, or another work type. Existing
ambiguous records require artist/staff review; they remain visible under All and
their applicable format filter. No historical category is guessed from AI tags.
Artists can use **My Portfolio → Edit categories** to update their own existing
artwork listings. This action changes catalogue categories only.

Filtering checks every assigned category, including secondary ones. Mobile and
desktop share the same matcher. Searching also includes category labels. The
category menu replaces the former nonfunctional broad-group labels; style and
subject searches remain available through descriptive tags.
