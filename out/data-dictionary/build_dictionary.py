import json
import csv
from pathlib import Path
from decimal import Decimal
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.section import WD_ORIENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

ROOT = Path(__file__).parent
schema = json.loads((ROOT / 'schema.json').read_text(encoding='utf-8'))
HEADERS = ['TABLE NAME', 'ATTRIBUTE NAME', 'TYPE', 'FORMAT', 'RANGE', 'REQUIRED', 'PK or FK', 'REFERENCED TABLE']
GROUPS = [('users', 'Users and account applications'), ('artist_applications', 'Artist applications'), ('artworks', 'Artworks'), ('cart', 'Shopping carts'), ('auctions', 'Auctions'), ('messaging', 'Messaging agreements and royalties'), ('wallets', 'Payments wallets and support'), ('fulfillment', 'Delivery and fulfillment'), ('commissions', 'Commissions'), ('blockchain', 'Blockchain and provenance'), ('notifications', 'Notifications'), ('delivery', 'Legacy delivery')]

def describe(f):
    kind, name = f['type'], f['name']
    dtype = f['db_type'].replace('varchar', 'character varying')
    fmt, limits = 'Text', 'N/A'
    if kind in ('AutoField', 'BigAutoField'):
        fmt, limits = 'System generated integer', '1 to 2^63 - 1' if kind == 'BigAutoField' else '1 to 2^31 - 1'
    elif kind in ('ForeignKey', 'OneToOneField'):
        fmt, limits = 'Existing key value', 'Existing referenced record'
    elif kind == 'BooleanField':
        fmt, limits = 'TRUE / FALSE', 'TRUE, FALSE'
    elif kind == 'DateTimeField':
        fmt = 'YYYY-MM-DD HH:MM:SS with time zone'
    elif kind == 'DateField':
        fmt = 'YYYY-MM-DD'
    elif kind == 'UUIDField':
        fmt = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
    elif kind == 'JSONField':
        fmt = 'Valid JSON value'
    elif kind == 'BinaryField':
        fmt = 'Binary bytes'
    elif kind == 'DecimalField':
        fmt = f"{f['max_digits']} total digits, {f['decimal_places']} decimal places"
        maxval = Decimal(10) ** (f['max_digits'] - f['decimal_places']) - Decimal(10) ** (-f['decimal_places'])
        limits = f'-{maxval} to {maxval}'
    elif kind == 'FloatField':
        fmt, limits = 'Floating point number', 'Double precision'
    elif 'Integer' in kind:
        fmt = 'Whole number'
        if 'Positive' in kind:
            bits = 63 if 'Big' in kind else 15 if 'Small' in kind else 31
            limits = f'0 to 2^{bits} - 1'
        else:
            limits = '-2^31 to 2^31 - 1'
    elif kind == 'FileField':
        fmt = 'Stored file path'
    elif 'email' in name:
        fmt = 'name@domain.com'
    elif 'url' in name:
        fmt = 'URL text'
    if kind in ('CharField', 'FileField') and f['max_length']:
        limits = f"Up to {f['max_length']} characters"
    if f['choices']:
        limits = ', '.join(str(value) for value, label in f['choices'])
    else:
        # Built-in integer capacity is already represented above. Preserve
        # explicit business bounds such as rating and nonnegative amounts.
        v = []
        for typ, val in f['validators']:
            if val in ('-9223372036854775808', '9223372036854775807', '-2147483648', '2147483647', '32767'):
                continue
            if 'Positive' in kind and val == '0':
                continue
            v.append(('Minimum ' if typ == 'MinValueValidator' else 'Maximum ') + val)
        if v:
            limits = '; '.join(v) + (f'; {limits}' if kind == 'DecimalField' else '')
    if f['unique'] and not f['pk']:
        limits += '; unique'
    key = 'PK' if f['pk'] else 'FK' if f['reference'] else ''
    return [dtype, fmt, limits, 'FALSE' if f['null'] else 'TRUE', key, f['reference'] or 'N/A']

def breakable(value):
    return value.replace('_', '_\u200b')

doc = Document()
sec = doc.sections[0]
sec.orientation = WD_ORIENT.LANDSCAPE
sec.page_width, sec.page_height = Inches(11.69), Inches(8.27)
sec.top_margin = sec.bottom_margin = Inches(.48)
sec.left_margin = sec.right_margin = Inches(.42)
sec.header_distance = sec.footer_distance = Inches(.22)
for style in ('Normal', 'Title', 'Heading 1', 'Heading 2'):
    doc.styles[style].font.name = 'Times New Roman'
    doc.styles[style].font.color.rgb = RGBColor(0, 0, 0)
    fonts = doc.styles[style].element.get_or_add_rPr().find(qn('w:rFonts'))
    for attr in list(fonts.attrib):
        if 'Theme' in attr: del fonts.attrib[attr]
for style in doc.styles:
    for border in list(style.element.iter(qn('w:pBdr'))):
        border.getparent().remove(border)
doc.styles['Normal'].font.size = Pt(9)
doc.styles['Normal'].paragraph_format.space_after = Pt(0)
doc.styles['Normal'].paragraph_format.line_spacing = 1
doc.styles['Title'].font.size = Pt(20)
doc.styles['Title'].paragraph_format.space_after = Pt(8)
doc.styles['Heading 1'].font.size = Pt(13)
doc.styles['Heading 1'].paragraph_format.space_before = Pt(12)
doc.styles['Heading 1'].paragraph_format.space_after = Pt(6)
doc.styles['Heading 2'].font.size = Pt(11)
doc.styles['Heading 2'].paragraph_format.space_before = Pt(9)
doc.styles['Heading 2'].paragraph_format.space_after = Pt(5)
doc.add_paragraph('ArtFiliere Data Dictionary', 'Title')
doc.add_paragraph('Database reference for the ArtFiliere system ERD\n7 November 2026')
doc.add_paragraph(f"This dictionary describes {len(schema)} application tables and {sum(len(t['fields']) for t in schema)} columns, using the current table names and PostgreSQL data types.")
doc.add_paragraph('REQUIRED is TRUE when the column cannot contain SQL NULL. A TRUE value does not mean a user must enter the value: IDs, timestamps and defaults may be supplied automatically, and some text fields permit empty strings. PK means primary key and FK means foreign key. A unique FK represents a one-to-one relationship.')
doc.add_paragraph('RANGE lists declared choices, length limits, numeric capacity or field validators. Choices and validators may be enforced by the application rather than a database constraint. N/A means no specific range or referenced table applies. The legacy rider table refers to Django auth_user; framework tables are outside this application dictionary. JSON contents and text-based identifiers do not create foreign key relationships.')
for paragraph in doc.paragraphs[1:]:
    paragraph.paragraph_format.space_after = Pt(5)
foot = sec.footer.paragraphs[0]
foot.alignment = WD_ALIGN_PARAGRAPH.RIGHT
foot.add_run('ArtFiliere Data Dictionary  |  ')
fld = OxmlElement('w:fldSimple'); fld.set(qn('w:instr'), 'PAGE'); foot._p.append(fld)
widths = [1.42, 1.62, 1.22, 1.31, 2.00, .80, .57, 1.91]
all_rows = []
for app, title in GROUPS:
    doc.add_paragraph(title, 'Heading 1')
    for table in sorted((t for t in schema if t['app'] == app), key=lambda t: t['table']):
        doc.add_paragraph(table['table'].replace('_', ' '), 'Heading 2')
        grid = doc.add_table(rows=1, cols=8)
        grid.alignment = WD_TABLE_ALIGNMENT.CENTER
        grid.autofit = False
        for col, width in zip(grid.columns, widths): col.width = Inches(width)
        borders = OxmlElement('w:tblBorders')
        for side in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
            edge = OxmlElement('w:' + side)
            for attr, val in [('val', 'single'), ('sz', '4'), ('color', '000000')]: edge.set(qn('w:' + attr), val)
            borders.append(edge)
        grid._tbl.tblPr.append(borders)
        header = grid.rows[0]
        repeat = OxmlElement('w:tblHeader'); header._tr.get_or_add_trPr().append(repeat)
        for cell, value in zip(header.cells, HEADERS):
            cell.text = value
            shade = OxmlElement('w:shd'); shade.set(qn('w:fill'), 'D9D9D9'); cell._tc.get_or_add_tcPr().append(shade)
            for run in cell.paragraphs[0].runs: run.bold = True
        for f in table['fields']:
            vals = [table['table'], f['name']] + describe(f)
            all_rows.append(vals)
            row = grid.add_row()
            for cell, value in zip(row.cells, vals): cell.text = breakable(value)
        for row in grid.rows:
            no_split = OxmlElement('w:cantSplit'); row._tr.get_or_add_trPr().append(no_split)
            for i, cell in enumerate(row.cells):
                cell.width = Inches(widths[i])
                cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
                pr = cell._tc.get_or_add_tcPr()
                margins = OxmlElement('w:tcMar')
                for side in ('top', 'left', 'bottom', 'right'):
                    item = OxmlElement('w:' + side); item.set(qn('w:w'), '65'); item.set(qn('w:type'), 'dxa'); margins.append(item)
                pr.append(margins)
                for para in cell.paragraphs:
                    para.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    para.paragraph_format.keep_with_next = row is grid.rows[0]
                    # Rows are recreated by python-docx, so compare XML nodes.
                    para.paragraph_format.keep_with_next = row._tr is header._tr
                    for run in para.runs: run.font.size = Pt(9)
        doc.add_paragraph().paragraph_format.space_after = Pt(2)

path = ROOT / 'ArtFiliere Data Dictionary.docx'
doc.save(path)
with (ROOT / 'dictionary_rows.csv').open('w', encoding='utf-8-sig', newline='') as out:
    writer = csv.writer(out); writer.writerow(HEADERS); writer.writerows(all_rows)
assert len(all_rows) == 805
print(path)
print('Verified', len(schema), 'tables and', len(all_rows), 'column entries')
