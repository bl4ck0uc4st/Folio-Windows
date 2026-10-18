#!/usr/bin/env python3
"""Build a Windows, strictly offline adaptation of bl4ck0uc4st/folio.

Usage: python build_windows.py PATH_TO_UPSTREAM [OUTPUT_DIRECTORY]
Uses the upstream prebuilt HTML as the library/font payload. No npm needed.
The upstream source and prebuilt HTML must belong to commit
1c4edf9a3542ccf86e14593af7c030b00f7f93ef (the version inspected for this build).
"""
from pathlib import Path
import re
import sys

UPSTREAM_COMMIT = "1c4edf9a3542ccf86e14593af7c030b00f7f93ef"


def replace_once(text, old, new):
    if text.count(old) != 1:
        raise ValueError(f"Expected one match for {old[:110]!r}")
    return text.replace(old, new, 1)


def windows_text(text):
    for old, new in [
        ("⇧⌘Z", "Ctrl+Shift+Z"), ("⌘Z", "Ctrl+Z"),
        ("⌘D", "Ctrl+D"), ("'⌘'", "'Ctrl'"),
        ("this Mac", "this PC"), ("your Mac", "your PC"),
        ("THIS MAC", "THIS PC"), ("Command-K", "Ctrl+K"),
    ]:
        text = text.replace(old, new)
    return text


def source_text(name):
    return (Path(__file__).parent / name).read_text(encoding="utf-8")


def patch_editor(text):
    text = replace_once(text,
        "const ED_FONTS = [['helvetica', 'Sans'], ['times', 'Serif'], ['courier', 'Mono']];",
        "const ED_FONTS = [['helvetica', 'Sans'], ['times', 'Serif'], ['courier', 'Mono'], ['carlito', 'Calibri'], ['caladea', 'Cambria']];")
    text = text.replace("function baselineRatio(family, bold, italic) {", "function baselineRatio(family, bold, italic, cssOverride) {")
    text = replace_once(text, "const key = family + (bold ? 'b' : '') + (italic ? 'i' : '');", "const key = family + (bold ? 'b' : '') + (italic ? 'i' : '') + (cssOverride || '');")
    text = replace_once(text, "${CSS_FAMILY[family]}", "${cssOverride || CSS_FAMILY[family] || CSS_FAMILY.helvetica}")
    text = replace_once(text,
        "if (cur && gap < 0.9 * Math.max(cur.size, it.size) && Math.abs(it.size - cur.size) < 0.25 * cur.size && gap > -0.5 * it.size) {",
        "if (cur && gap < 0.9 * Math.max(cur.size, it.size) && Math.abs(it.size - cur.size) < 0.02 && gap > -0.5 * it.size && cur.font.bold === it.font.bold && cur.font.italic === it.font.italic && editorFontName(cur.font.sourceName || cur.font.name) === editorFontName(it.font.sourceName || it.font.name) && Math.abs((cur.horizontalScale || 1) - (it.horizontalScale || 1)) < 0.002 && JSON.stringify(cur.color || null) === JSON.stringify(it.color || null)) {")
    text = replace_once(text,
        "font: { ...it.font } };",
        "font: { ...it.font }, color: it.color, horizontalScale: it.horizontalScale || 1 };")
    text = replace_once(text,
        "return segs.map((s) => ({ ...s, text: s.text.replace(/\\s+/g, ' ').trim() })).filter((s) => s.text);",
        "return segs.filter((s) => s.text.trim());")
    text = replace_once(text,
        "pageText(this.src, i).then((t) => textSegments(t.items)).catch(() => [])",
        "analyzePage(this.src, i, { background: true, dpi: 96 }).then((t) => { const segments = textSegments(t.items.filter(it => it.visible !== false)); if (t.bg) freeCanvas(t.bg.canvas); return segments; }).catch(() => [])")
    text = replace_once(text,
        "Object.assign(el.style, { left: px(o.x), top: px(o.y), font: edFont(o, k), color: o.color });",
        "Object.assign(el.style, { left: px(o.x), top: px(o.y), color: o.color }, editorTextAppearance(o, o.text, k));")
    text = replace_once(text,
        "textWidth(winNormalize(l || ' '), f)", "editorTextWidth(o, l || ' ')")
    text = replace_once(text,
        "    const font = seg.font.mono ? 'courier' : seg.font.serif ? 'times' : 'helvetica';\n    const size = Math.round(seg.size * 2) / 2;",
        "    const matched = await editorMatchedStyle(this.src, i, seg);\n    const { font } = matched;\n    const size = seg.size;")
    text = replace_once(text,
        "id: uid('o'), page: i, type: 'text', text: seg.text, size, font, bold: !!seg.font.bold, italic: !!seg.font.italic,\n      color: '#' + rgbToHex(ink), x: seg.x, y: seg.y - baselineRatio(font, seg.font.bold, seg.font.italic) * size, cover: cover.id,",
        "id: uid('o'), page: i, type: 'text', text: seg.text, originalText: seg.text, size, ...matched, bold: !!seg.font.bold, italic: !!seg.font.italic,\n      color: '#' + rgbToHex(seg.color || ink), x: seg.x, y: 0, cover: cover.id,")
    text = replace_once(text,
        "    this.st.objs.push(cover, text);\n    this.commit(before);",
        "    text.y = seg.y - editorBaseline(text) * size;\n    text.originalStyle = { font: text.font, bold: text.bold, italic: text.italic, size: text.size, color: text.color };\n    this.st.objs.push(cover, text);\n    this._pendingBefore = before;")
    text = replace_once(text,
        "Object.assign(ta.style, { left: `${o.x * k}px`, top: `${o.y * k}px`, font: edFont(o, k), color: o.color });",
        "Object.assign(ta.style, { left: `${o.x * k}px`, top: `${o.y * k}px`, color: o.color }, editorTextAppearance(o, ta.value, k));")
    text = replace_once(text,
        "const w = Math.max(...lines.map((l) => textWidth(winNormalize(l || ' '), { family: o.font, bold: o.bold, italic: o.italic, size: o.size })), o.size * 2);\n      ta.style.width = `${(w + o.size * 1.2) * k}px`;",
        "const appearance = editorTextAppearance(o, ta.value, k);\n      Object.assign(ta.style, appearance);\n      const horizontal = parseFloat(appearance.transform.slice(7)) || 1;\n      const w = Math.max(...lines.map((l) => editorTextWidth(o, l || ' ')), o.size * 2);\n      ta.style.width = `${(w / horizontal + o.size * 1.2) * k}px`;")
    text = replace_once(text,
        "      if (!o.text.trim()) {\n        this.st.objs = this.st.objs.filter((x) => x.id !== o.id && x.id !== o.cover);",
        "      const unchanged = o.cover && o.text === o.originalText && Object.entries(o.originalStyle || {}).every(([key, value]) => o[key] === value);\n      if (unchanged || !o.text.trim()) {\n        this.st.objs = this.st.objs.filter((x) => x.id !== o.id && !(unchanged && x.id === o.cover));")
    text = replace_once(text,
        "Object.assign(this.editing.el.style, { font: edFont(o, this.scale), color: o.color });",
        "Object.assign(this.editing.el.style, { color: o.color }, editorTextAppearance(o, this.editing.el.value, this.scale));")
    text = replace_once(text,
        "    const o = this.selObj;\n    if ((k === 'Delete'",
        "    if (mod && k.toLowerCase() === 'y') { e.preventDefault(); this.redo(); return true; }\n    const o = this.selObj;\n    if ((k === 'Delete'")
    text = replace_once(text,
        "      const size = numberInput(cur.size,",
        "      if (cur.sourceFontName) out.push(h('span', { class: 'ed-original-style', title: 'Keeps the original PDF font when its glyphs are available' }, cur.sourceFontName));\n      const size = numberInput(cur.size,")
    text = replace_once(text,
        "    const base = baselineRatio(o.font || 'helvetica', o.bold, o.italic);",
        "    if (editorDrawOriginal(pc, o, lines)) return;\n    const base = editorBaseline(o);")
    text = replace_once(text,
        "size: o.size, color: hexColor(o.color) });",
        "size: o.size, color: hexColor(o.color), scale: o.horizontalScale || 1, spacing: (o.tracking || 0) * o.size * (o.horizontalScale || 1) });")
    return source_text("editor_text.js") + "\n" + text


def local_scan(text):
    # Keep all of the original crop, cleanup, rotation, and PDF export code.
    # Remove the helper, QR generation, pairing, polling, and LAN code entirely.
    text = "/* ---------- Local scan cleanup: no network helper ---------- */\n" + text[text.index("const SCAN_FILTERS"):]
    text = replace_once(text,
        "desc: 'Use your phone’s camera to scan paper documents. Photos travel over your own Wi‑Fi straight to this Mac.',",
        "desc: 'Import document photos or scans from this PC. Straighten pages, clean up shadows, and save a PDF locally.',")
    text = replace_once(text,
        "blurb: 'Scan paper with your phone. Pages straighten and clean up automatically.',",
        "blurb: 'Straighten and clean up document photos saved on this PC.',")
    text = replace_once(text,
        "state: { pages: [], conn: 'off', helper: null, session: null, done: false, filter: 'document', size: 'fit', seen: new Set(), fetching: new Set() },",
        "state: { pages: [], filter: 'document', size: 'fit' },")
    text = replace_once(text,
        "  leave() { clearInterval(this.timer); this.timer = null; },\n", "")
    text = replace_once(text,
        "    // Phone pages get their place when they are announced, so they stay in the order they were taken.\n",
        "    // Local imports keep the order selected in the file picker.\n")
    start = text.index("  /* ----- Talking to the helper ----- */")
    end = text.index("  /* ----- Views ----- */", start)
    text = text[:start] + """  newScan() {
    for (const p of this.state.pages) if (p.thumb) URL.revokeObjectURL(p.thumb);
    this.state.pages = [];
    render();
  },
""" + text[end:]
    text = replace_once(text, "    this.startPolling();\n", "")
    start = text.index("  renderConnect() {")
    end = text.index("  renderPages(initial) {", start)
    text = text[:start] + """  renderConnect() {
    if (!this.connectEl) return;
    this.connectEl.replaceChildren(
      h('span', { class: 'scan-pill on' }, h('i'), 'Local files only'),
      h('h2', { class: 'local-scan-title' }, 'Paper to PDF, on your PC'),
      h('ol', { class: 'scan-steps' },
        h('li', null, h('strong', null, 'Save your scans or photos'), h('span', null, 'Use images already on your computer. A scanner can save pages as JPG or PNG first.')),
        h('li', null, h('strong', null, 'Add and check the pages'), h('span', null, 'Choose images below, or drag them here. Drag pages to reorder; double-click to adjust corners.')),
        h('li', null, h('strong', null, 'Choose a look and save'), h('span', null, 'Use Clean, Grayscale, Black & white, or Original. Then choose Create PDF.'))),
      button('Choose images…', 'image', openPicker, 'btn primary local-scan-choose'),
      h('p', { class: 'scan-fine' }, 'Everything runs in this window. No pairing, phone connection, account, or internet is needed.'));
  },
""" + text[end:]
    start = text.index("    if (p.source === 'phone' && st.conn !== 'off') {")
    end = text.index("    this.renderPages();", start)
    text = text[:start] + text[end:]
    return text


PRIVACY_HANDLER = """  $('#stamp').addEventListener('click', () => {
    openModal({
      title: 'Your files stay on this PC',
      body: h('div', { class: 'local-privacy' },
        h('p', null, 'Folio Windows opens the files you choose, processes them in your browser, and saves results through your browser’s download controls.'),
        h('ul', null,
          h('li', null, 'Works with Wi-Fi turned off. All code, fonts, and PDF libraries are inside this HTML file.'),
          h('li', null, 'The page blocks internet, local-network, and localhost connections. There is no server or phone helper.'),
          h('li', null, 'Opened documents are held in memory. Close all Folio windows when you finish.'),
          h('li', null, 'Tool settings stay in this browser. A signature is remembered only if you select “Remember on this PC”.'),
          h('li', null, 'For files to remain only on this PC, choose a folder outside OneDrive, Dropbox, or other synced locations when saving.')),
        h('p', { class: 'hint' }, 'This page controls its own connections. Your browser, extensions, and Windows have their own settings.'),
        button('Forget saved signatures', 'trash', () => {
          try { localStorage.removeItem(SIG_KEY); } catch { /* storage unavailable */ }
          sigCurrent.signature = null;
          sigCurrent.initials = null;
          toast('Remembered signatures cleared. Signatures already placed on a page stay on that page.', 'ok');
        }, 'btn small')),
      actions: [{ label: 'Done', primary: true, value: true }],
    });
  });"""


def patch_module(name, text):
    if name == "41-scan.js":
        text = local_scan(text)
    elif name == "10-shell.js":
        text = replace_once(text, "const USER_NAME = 'Vraj';", source_text("greeting.js"))
        start = text.index("function greeting() {", text.index("const TOOL_WORDS"))
        end = text.index("function filterTools(q) {", start)
        text = text[:start] + text[end:]
        text = replace_once(text, "h('h1', null, greeting()),", "h('div', { class: 'greeting-title' }, h('h1', { id: 'home-greeting' }, greeting()), button('Personalize', null, personalizeGreeting, 'btn quiet small', 'Choose the name in your greeting')),")
        text = replace_once(text,
            "scan: 'phone camera paper document'",
            "scan: 'local image scanner paper cleanup document'")
        text = replace_once(text,
            "Open it in Preview and use File › Print › Save as PDF first.",
            "Open it in a PDF viewer and use Print › Microsoft Print to PDF first.") if "Open it in Preview" in text else text
        text = text.replace("open it in Preview and use File › Print › Save as PDF first.",
            "open it in a PDF viewer and use Print › Microsoft Print to PDF first.")
        start = text.index("  $('#stamp').addEventListener('click', () => {")
        end = text.index("  render();", start)
        text = text[:start] + PRIVACY_HANDLER + "\n" + text[end:]
        text = replace_once(text,
            "document.title = t ? `${t.title} – Folio` : 'Folio';",
            "document.title = t ? `${t.title} – Folio Windows` : 'Folio Windows';")
    elif name == "02-sources.js":
        text = replace_once(text,
            'Open Folio in Safari for HEIC photos.',
            'Save the photo as JPG or PNG first, then add it again.')
    elif name == "01-ui.js":
        text = replace_once(text,
            'Saved “${name}” to Downloads (${fmtSize(blob.size)}).',
            'Download ready: “${name}” (${fmtSize(blob.size)}). Check your browser’s downloads or save dialog.')
    elif name == "31-sign.js":
        start = text.index("const SIG_FONTS = [")
        end = text.index("const SIG_INKS", start)
        text = text[:start] + """const SIG_FONTS = [
  ['"Segoe Script", "Lucida Handwriting", cursive', 'Segoe Script'],
  ['"Lucida Handwriting", "Segoe Script", cursive', 'Lucida Handwriting'],
  ['"Brush Script MT", "Segoe Script", cursive', 'Brush Script'],
  ['"Monotype Corsiva", "Segoe Script", cursive', 'Monotype Corsiva'],
  ['"Comic Sans MS", cursive', 'Comic Sans'],
];
""" + text[end:]
    elif name == "30-editor.js":
        text = patch_editor(text)
    elif name == "50-pdfread.js":
        text = replace_once(text, "      font.name = name;", "      font.name = name; font.sourceName = String(f.name || '');")
        text = replace_once(text, "angle: Math.atan2(m[1], m[0]),", "angle: Math.atan2(m[1], m[0]), horizontalScale: Math.hypot(m[0], m[1]) / size,")
    elif name == "67-xlsx.js":
        # CSV and workbooks without explicit styles have no indent value.
        # The original multiplied undefined by 9, producing NaN PDF coordinates.
        text = replace_once(text,
            "    const pad = 2 + xf.indent * 9;",
            "    const pad = 2 + (Number.isFinite(xf.indent) ? xf.indent : 0) * 9;")
    text = windows_text(text)
    text = text.replace("h('kbd', null, 'Ctrl'), ' ', h('kbd', null, 'O')", "h('kbd', null, 'Ctrl'), ' + ', h('kbd', null, 'O')")
    # Keep this adaptation's browser settings separate from the original app.
    text = text.replace("pdf-toolkit/v2", "folio-windows/v1")
    text = text.replace("pdf-toolkit/signatures", "folio-windows/signatures")
    return text


def build(upstream, output):
    upstream, output = Path(upstream).resolve(), Path(output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    html = (upstream / "dist/Folio.html").read_text(encoding="utf-8")
    if html.count("/* ===== 00-util.js ===== */") != 1:
        raise ValueError("Expected Folio 1.0.0's prebuilt HTML module markers")
    # Replace exactly the application script; preserve embedded libraries/fonts.
    pattern = r"<script>\s*\(function \(\) \{\s*/\* ===== 00-util\.js ===== \*/.*?</script>"
    app = "(function () {\n" + "\n".join(
        f"/* ===== {p.name} ===== */\n" + patch_module(p.name, p.read_text(encoding="utf-8"))
        for p in sorted((upstream / "src/js").glob("*.js"))) + "\n})();\n"
    if re.search(r"</script|<!--", app, re.I):
        raise ValueError("Application contains an HTML script terminator")
    html, count = re.subn(pattern, lambda m: "<script>\n" + app + "</script>", html, flags=re.S)
    if count != 1:
        raise ValueError(f"Expected one application script; got {count}")
    html = windows_text(html)
    html = replace_once(html,
        "connect-src http://127.0.0.1:47321 blob: data:;",
        "connect-src blob: data:;")
    html = replace_once(html,
        "<!-- Network lock: this page may not connect to anything except the optional scan helper running on this PC (127.0.0.1). -->",
        "<!-- Network lock: no HTTP, HTTPS, WebSocket, LAN, or localhost connections. Only in-memory blob/data resources are allowed. -->")
    html = replace_once(html, "<title>Folio</title>", "<title>Folio Windows</title>")
    html = replace_once(html, '<div class="brand-sub">PDF tools that work offline</div>',
        '<div class="brand-sub">PDF tools · fully offline</div>')
    html = replace_once(html, '<div class="brand-name">Folio</div>',
        '<div class="brand-name">Folio <span class="windows-edition">WINDOWS</span></div>')
    # No embedded phone helper or QR library is shipped in this edition.
    html, count = re.subn(r'<script type="text/plain" id="scan-helper-src">.*?</script>\n?', '', html, count=1, flags=re.S)
    if count != 1:
        raise ValueError("Embedded helper not found")
    qrcode_pattern = r'<script>//-+\n//\n// QR Code Generator for JavaScript.*?</script>\n?'
    html, count = re.subn(qrcode_pattern, '', html, count=1, flags=re.S)
    if count != 1:
        raise ValueError("Embedded QR generator not found")
    css = (Path(__file__).parent / "windows.css").read_text(encoding="utf-8")
    html = replace_once(html, "</style>", css + "\n</style>")
    html = re.sub(r"(?m)^//# sourceMappingURL=.*$", "", html)
    if "SCAN_ORIGIN" in html or "helperFetch(" in html:
        raise ValueError("Network helper code survived the build")
    target = output / "Folio-Windows.html"
    target.write_text(html, encoding="utf-8")
    (output / "application-check.js").write_text(app, encoding="utf-8")
    print(f"Built {target} ({target.stat().st_size:,} bytes)")
    return target


if __name__ == "__main__":
    if len(sys.argv) not in (2, 3):
        raise SystemExit(__doc__)
    build(sys.argv[1], sys.argv[2] if len(sys.argv) == 3 else Path(__file__).resolve().parent.parent)
