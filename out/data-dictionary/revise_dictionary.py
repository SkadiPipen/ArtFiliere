import json
import csv
from decimal import Decimal
from pathlib import Path
from docx import Document

ROOT = Path(__file__).parent
schema = json.loads((ROOT / 'schema.json').read_text(encoding='utf-8'))
doc = Document(ROOT / 'ArtFiliere Data Dictionary.docx')
by_table = {t['table']: t for t in schema}
fields = {(t['table'], f['name']): f for t in schema for f in t['fields']}

def describe(f):
    kind, name, db = f['type'], f['name'], f['db_type']
    dtype = db
    if db == 'bigint': dtype = 'bigint(64)'
    elif db == 'integer': dtype = 'integer(32)'
    elif db == 'smallint': dtype = 'smallint(16)'
    elif db.startswith('varchar('): dtype = 'character varying (' + db[8:]
    elif db.startswith('numeric('): dtype = db.replace('numeric(', 'numeric (')
    elif db == 'double precision': dtype = 'double precision(64)'

    fmt, limits = 'Xxxxxxx', 'NA'
    if db in ('bigint', 'integer', 'smallint'):
        fmt = '######'
        bits = {'bigint': 64, 'integer': 32, 'smallint': 16}[db]
        low, high = -(2 ** (bits - 1)), 2 ** (bits - 1) - 1
        if kind in ('AutoField', 'BigAutoField'): low = 1
        elif kind.startswith('Positive'): low = 0
        # Foreign-key IDs use their parent key's numeric domain.
        if f['reference']:
            parent = f['reference'].split('(')[0]
            column = f['reference'].split('(')[1][:-1]
            target = fields.get((parent, column))
            if target and target['type'] in ('AutoField', 'BigAutoField'): low = 1
            elif parent == 'auth_user': low = 1
        for typ, value in f['validators']:
            number = int(value)
            if typ == 'MinValueValidator': low = max(low, number)
            else: high = min(high, number)
        limits = f'{low}-{high}'
    elif kind == 'BooleanField': fmt = 'TRUE/FALSE'
    elif kind == 'DateField': fmt = 'YYYY-MM-DD'
    elif kind == 'DateTimeField': fmt = 'MM-DD-YYYY HH:MM:SS'
    elif db == 'uuid': fmt = 'UUID'
    elif kind == 'JSONField': fmt = 'JSON object/array/value'
    elif kind == 'BinaryField': fmt = 'Binary data'
    elif kind == 'DecimalField':
        scale = f['decimal_places']
        fmt = '######' + ('.' + '#' * scale if scale else '')
        high = Decimal(10) ** (f['max_digits'] - scale) - Decimal(10) ** (-scale)
        low = -high
        for typ, value in f['validators']:
            if typ == 'MinValueValidator': low = max(low, Decimal(value))
            elif typ == 'MaxValueValidator': high = min(high, Decimal(value))
        limits = f'{low} to {high}'
    elif kind == 'FloatField':
        fmt = '######.######'
        bounds = [('Minimum ' if typ == 'MinValueValidator' else 'Maximum ') + value for typ, value in f['validators']]
        limits = '; '.join(bounds) if bounds else 'NA'
    elif kind == 'FileField': fmt = 'File path'
    elif 'email' in name: fmt = 'email@domain.com'
    elif 'url' in name: fmt = 'URL'
    elif 'phone' in name or name == 'contact_number': fmt = '###########'

    if f['choices']:
        limits = ', '.join("'" + str(value) + "'" for value, label in f['choices'])
    if f['reference'] and db not in ('bigint', 'integer', 'smallint'):
        fmt = 'UUID' if db == 'uuid' else 'Xxxxxxx'
    return [dtype, fmt, limits, 'FALSE' if f['null'] else 'TRUE', 'PK' if f['pk'] else 'FK' if f['reference'] else '', f['reference'].split('(')[0] if f['reference'] else '']

def set_cell(cell, text):
    text = text.replace('_', '_\u200b')
    paragraph = cell.paragraphs[0]
    if paragraph.runs:
        paragraph.runs[0].text = text
        for run in paragraph.runs[1:]: run.text = ''
    else: paragraph.add_run(text)

count = 0
rows = []
for table in doc.tables:
    for row in table.rows[1:]:
        tname = row.cells[0].text.replace('\u200b', '')
        fname = row.cells[1].text.replace('\u200b', '')
        f = fields[(tname, fname)]
        vals = [tname, fname] + describe(f)
        for cell, value in zip(row.cells, vals): set_cell(cell, value)
        rows.append(vals)
        count += 1
assert count == 805

intro = [
    'Database reference for the ArtFiliere system ERD\n7 November 2026',
    'This dictionary describes 73 application tables and 805 attributes using the current table names, declared field lengths, allowed values and foreign key references.',
    'FORMAT shows illustrative patterns: # represents a numeric digit and X represents text. The patterns are examples, not fixed field lengths or validation rules. TYPE includes character limits or numeric precision. NA means no specific range is declared. Referenced tables are named only for foreign keys.',
    'REQUIRED is TRUE when SQL NULL is not allowed. Generated values and defaults can satisfy this requirement; some non-null text fields permit empty strings. PK means primary key and FK means foreign key. Choices and field validators may be enforced by the application. Legacy rider profiles reference Django auth_user, outside the 73 application tables.',
]
for paragraph, text in zip(doc.paragraphs[1:5], intro):
    paragraph.text = text

out = ROOT / 'ArtFiliere Data Dictionary Revised.docx'
doc.save(out)
with (ROOT / 'dictionary_rows_revised.csv').open('w', encoding='utf-8-sig', newline='') as stream:
    writer = csv.writer(stream)
    writer.writerow(['TABLE NAME','ATTRIBUTE NAME','TYPE','FORMAT','RANGE','REQUIRED','PK or FK','REFERENCED TABLE'])
    writer.writerows(rows)
print('Revised', count, 'entries in', out)
for table, name in [('user', 'id'), ('user', 'email'), ('user', 'date_of_birth'), ('wallet', 'user_id'), ('purchase_review', 'artist_rating'), ('delivery_route', 'distance_km')]:
    print(table, name, describe(fields[table, name]))
