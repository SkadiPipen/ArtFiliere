from pathlib import Path
import json
import pypdfium2 as pdfium
from PIL import Image, ImageDraw
from docx import Document
from pypdf import PdfReader

root=Path(__file__).parent
render=root/'render-revised'
doc=Document(root/'ArtFiliere Data Dictionary Revised.docx')
schema=json.loads((root/'schema.json').read_text(encoding='utf-8'))
expected={(t['table'], f['name']) for t in schema for f in t['fields']}
actual=[]
for table in doc.tables:
    assert len(table.columns)==8
    for row in table.rows[1:]:
        actual.append(tuple(c.text.replace('\u200b','') for c in row.cells[:2]))
assert len(actual)==len(expected)==805
assert set(actual)==expected
pdf=pdfium.PdfDocument(str(render/'ArtFiliere Data Dictionary Revised.pdf'))
images=[]
for i in range(len(pdf)):
    im=pdf[i].render(scale=1.333333).to_pil().convert('RGB')
    im.save(render/f'page-{i+1}.png')
    images.append(im)
for start in range(0,len(images),3):
    subset=images[start:start+3]
    sheet=Image.new('RGB',(max(im.width for im in subset),sum(im.height+28 for im in subset)),'#b0b0b0')
    draw=ImageDraw.Draw(sheet); y=0
    for j,im in enumerate(subset):
        draw.text((12,y+5),f'Page {start+j+1}',fill='black'); y+=28
        sheet.paste(im,(0,y)); y+=im.height
    sheet.save(render/f'review-{start//3+1}.png')
reader=PdfReader(render/'ArtFiliere Data Dictionary Revised.pdf')
text='\n'.join(p.extract_text() for p in reader.pages)
(render/'rendered-text.txt').write_text(text,encoding='utf-8')
assert all('TABLE NAME' in p.extract_text() for p in reader.pages)
print('Verified 73 tables, 805 fields and eight columns per table.')
print('Rendered',len(images),'pages and',(len(images)+2)//3,'review sheets.')
