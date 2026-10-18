from pathlib import Path
import json

import fitz
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'test-output'
results = []


def check(name, condition):
    results.append({'name': name, 'pass': bool(condition)})
    print(('PASS ' if condition else 'FAIL ') + name)
    assert condition, name


for name, old, replacement, expected in [
    ('standard', 'Original text style', 'Updated text style', 'Helvetica'),
    ('embedded', 'Original embedded style', 'Original embedded styles', 'Carlito'),
    ('cid', 'Original CID text style', 'Original CID text styles', 'Carlito'),
]:
    source = fitz.open(OUT / 'fixtures' / f'{name}.pdf')
    edited = fitz.open(OUT / f'{name}-edited.pdf')
    def spans(doc):
        return [span for block in doc[0].get_text('dict')['blocks'] if 'lines' in block for line in block['lines'] for span in line['spans']]
    original = next(s for s in spans(source) if s['text'] == old)
    changed = next(s for s in spans(edited) if s['text'] == replacement)
    check(name + ': edited text uses the original PDF font', changed['font'] == original['font'] and expected in changed['font'])
    check(name + ': exact size retained on export', abs(changed['size'] - original['size']) < .01)
    colour_error = max(abs(((changed['color'] >> shift) & 255) - ((original['color'] >> shift) & 255)) for shift in (0, 8, 16))
    check(name + ': text colour matches within one display level', colour_error <= 1)
    check(name + ': baseline position retained', max(abs(changed['origin'][i] - original['origin'][i]) for i in (0, 1)) < .05)
    reader = PdfReader(OUT / f'{name}-edited.pdf')
    check(name + ': output remains a valid selectable-text PDF', replacement in reader.pages[0].extract_text())
    stream = reader.pages[0].get_contents().get_data()
    check(name + ': no invalid text coordinates', b'NaN' not in stream and b'Infinity' not in stream)
    if name == 'standard':
        # Text after the edited line retains its original fonts and positions.
        for text in ['Regular', 'Bold', 'Serif italic sample']:
            a = next(s for s in spans(source) if s['text'] == text)
            b = next(s for s in spans(edited) if s['text'] == text)
            check('Untouched neighbouring text: ' + text, a['font'] == b['font'] and a['bbox'] == b['bbox'])
(OUT / 'matching-file-results.json').write_text(json.dumps({'results': results}, indent=2))
print(f'{len(results)} exported-file checks passed.')
