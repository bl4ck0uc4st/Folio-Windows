from pathlib import Path
import base64
import io
import json
import re
import zlib

import fitz
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'test-output' / 'fixtures'
OUT.mkdir(parents=True, exist_ok=True)
html = (ROOT / 'Folio-Windows.html').read_text(encoding='utf-8')
font_data = json.loads(re.search(r'<script type="application/json" id="font-data">(.*?)</script>', html, re.S)[1])
for family, style in [('carlito', 'regular'), ('caladea', 'italic')]:
    data = zlib.decompress(base64.b64decode(font_data[family][style]['ttf']))
    path = OUT / f'{family}-{style}.ttf'
    path.write_bytes(data)
    pdfmetrics.registerFont(TTFont(family, str(path)))

c = canvas.Canvas(str(OUT / 'standard.pdf'), pagesize=(612, 792))
t = c.beginText(72, 692)
t.setFont('Helvetica', 11.3)
t.setHorizScale(85)
t.setCharSpace(1.2)
t.setFillColorRGB(.1, .3, .65)
t.textOut('Original text style')
c.drawText(t)
c.setFont('Helvetica', 12)
c.setFillColorRGB(0, 0, 0)
c.drawString(72, 620, 'Regular')
c.setFont('Helvetica-Bold', 12)
c.drawString(115, 620, 'Bold')
c.setFont('Times-Italic', 13.75)
c.setFillColorRGB(.6, .1, .2)
c.drawString(72, 550, 'Serif italic sample')
c.save()

c = canvas.Canvas(str(OUT / 'embedded.pdf'), pagesize=(612, 792))
c.setFont('carlito', 18.25)
c.setFillColorRGB(.15, .25, .55)
c.drawString(72, 692, 'Original embedded style')
c.setFont('caladea', 15.35)
c.drawString(72, 620, 'Italic embedded style')
c.save()

doc = fitz.open()
page = doc.new_page(width=612, height=792)
page.insert_font(fontname='OriginalCID', fontfile=str(OUT / 'carlito-regular.ttf'))
page.insert_text((72, 100), 'Original CID text style', fontname='OriginalCID', fontsize=16.75, color=(.2, .3, .6))
doc.save(OUT / 'cid.pdf')
print(OUT)
