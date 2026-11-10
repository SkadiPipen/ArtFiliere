# ArtFiliere complete ERD

73 application tables, 805 application columns, 171 declared foreign keys, plus auth_user as a referenced framework table.

Open ArtFiliere ERD.html for the zoomable diagrams. Open ArtFiliere Complete ERD.drawio in diagrams.net to edit the table boxes and connectors. There are 14 pages: complete with all fields, complete with keys only, and 12 module diagrams. ArtFiliere Complete ERD.mmd is the equivalent editable Mermaid source.

Each module shows its local tables with all columns and all foreign keys belonging to those local tables. Referenced tables outside the module show key fields only. All 171 foreign keys appear in both complete diagrams and in their child table's module.

1 means exactly one parent; 0..1 means an optional parent or at most one child; 0..* means zero or more children. No minimum child count is inferred from a foreign key. A unique foreign key gives a one-to-one relationship. ? marks nullable columns. PK = primary key, FK = foreign key, UQ = unique.

No relationship is invented for JSON values, text identifiers or matching city names. delivery_route, artwork_ai_scan and provenance_signer therefore appear without foreign key connections. Legacy delivery tables remain separate; legacy_rider_profile references auth_user rather than the application user table.

Database and application code were not changed.
