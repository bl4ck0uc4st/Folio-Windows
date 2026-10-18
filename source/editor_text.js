/* Existing-text editing: retain source fonts, fractional sizes and PDF metrics. */
const editorSourceFonts = new Map();
const editorCompatibleFonts = new Map();
const editorMeasureCtx = document.createElement('canvas').getContext('2d');
const editorFontName = (name) => String(name || '').replace(/^\//, '').replace(/^[A-Z]{6}\+/, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
const editorPdfName = (value) => value && value.decodeText ? value.decodeText() : String(value || '').replace(/^\//, '');
const editorPdfNumber = (value, fallback = 0) => {
  const n = value && value.asNumber ? value.asNumber() : Number(value);
  return Number.isFinite(n) ? n : fallback;
};
function editorDecodeStream(stream) {
  try { return PDFLib.decodePDFRawStream(stream).decode(); } catch { return null; }
}
function editorTtfCmap(bytes, encodedMacRoman = false) {
  try {
    const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let table = 0;
    for (let i = 0; i < data.getUint16(4); i++) {
      const at = 12 + i * 16;
      if (data.getUint32(at) === 0x636D6170) { table = data.getUint32(at + 8); break; }
    }
    if (!table) return null;
    const subtables = [];
    for (let i = 0; i < data.getUint16(table + 2); i++) {
      const at = table + 4 + i * 8, platform = data.getUint16(at), encoding = data.getUint16(at + 2);
      const macRoman = platform === 1 && encoding === 0;
      if (platform !== 0 && !(platform === 3 && [1, 10].includes(encoding)) && !macRoman) continue;
      const offset = table + data.getUint32(at + 4), format = data.getUint16(offset);
      if ([0, 4, 6, 12].includes(format)) subtables.push({offset, format, macRoman});
    }
    const priority = {0: 0, 6: 1, 4: 2, 12: 3};
    subtables.sort((a, b) => priority[b.format] - priority[a.format]);
    if (!subtables.length) return null;
    const lookup = (code) => {
      try {
        for (const {offset: at, format, macRoman} of subtables) {
          if (macRoman && code > 127 && !encodedMacRoman) continue;
          if (format === 12) {
            let low = 0, high = data.getUint32(at + 12) - 1;
            while (low <= high) {
              const mid = (low + high) >> 1, group = at + 16 + mid * 12;
              const start = data.getUint32(group), end = data.getUint32(group + 4);
              if (code < start) high = mid - 1;
              else if (code > end) low = mid + 1;
              else return data.getUint32(group + 8) + code - start;
            }
          } else if (format === 6 && code <= 65535) {
            const first = data.getUint16(at + 6), count = data.getUint16(at + 8);
            if (code >= first && code < first + count) return data.getUint16(at + 10 + (code - first) * 2);
          } else if (format === 0 && code < 256) {
            return data.getUint8(at + 6 + code);
          } else if (format === 4 && code <= 65535) {
            const count = data.getUint16(at + 6) / 2, ends = at + 14, starts = ends + count * 2 + 2, deltas = starts + count * 2, offsets = deltas + count * 2;
            for (let i = 0; i < count; i++) {
              if (code > data.getUint16(ends + i * 2)) continue;
              const start = data.getUint16(starts + i * 2);
              if (code < start) break;
              const delta = data.getInt16(deltas + i * 2), range = data.getUint16(offsets + i * 2);
              if (!range) return (code + delta) & 65535;
              const glyph = data.getUint16(offsets + i * 2 + range + (code - start) * 2);
              return glyph ? (glyph + delta) & 65535 : 0;
            }
          }
        }
      } catch { /* malformed font table: use the compatible face */ }
      return 0;
    };
    lookup.hasUnicode = subtables.some(table => !table.macRoman);
    return lookup;
  } catch { return null; }
}
function editorUnicodeFont(bytes, codec) {
  // Some PDF subsets have only a MacRoman cmap, which browsers reject. Add a
  // Unicode cmap from the PDF's own ToUnicode map without changing any glyphs.
  try {
    const raw = editorTtfCmap(bytes, true);
    if (!raw) return null;
    const points = new Map();
    for (const [unicode, hex] of codec.mapping) {
      const characters = Array.from(unicode);
      if (characters.length !== 1) continue;
      const glyph = raw(parseInt(hex, 16));
      if (glyph) points.set(characters[0].codePointAt(0), glyph);
    }
    if (!points.size) return null;
    const groups = [];
    for (const [code, glyph] of [...points].sort((a, b) => a[0] - b[0])) {
      const last = groups[groups.length - 1];
      if (last && code === last.end + 1 && glyph === last.glyph + code - last.start) last.end = code;
      else groups.push({start: code, end: code, glyph});
    }
    const cmap = new Uint8Array(28 + groups.length * 12), cv = new DataView(cmap.buffer);
    cv.setUint16(2, 1); cv.setUint16(4, 3); cv.setUint16(6, 10); cv.setUint32(8, 12);
    cv.setUint16(12, 12); cv.setUint32(16, cmap.length - 12); cv.setUint32(24, groups.length);
    groups.forEach((group, i) => {
      const at = 28 + i * 12;
      cv.setUint32(at, group.start); cv.setUint32(at + 4, group.end); cv.setUint32(at + 8, group.glyph);
    });
    const source = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), count = source.getUint16(4), tables = [];
    let length = 12 + count * 16;
    for (let i = 0; i < count; i++) {
      const at = 12 + i * 16, tag = source.getUint32(at), start = source.getUint32(at + 8), size = source.getUint32(at + 12);
      const data = tag === 0x636D6170 ? cmap : bytes.slice(start, start + size);
      if (tag === 0x68656164 && data.length >= 12) data.fill(0, 8, 12);
      tables.push({tag, data, offset: length}); length += (data.length + 3) & ~3;
    }
    const output = new Uint8Array(length), view = new DataView(output.buffer);
    output.set(bytes.subarray(0, 12));
    const sum = data => {
      let total = 0;
      for (let i = 0; i < data.length; i += 4) total = (total + (((data[i] || 0) << 24) >>> 0) + ((data[i + 1] || 0) << 16) + ((data[i + 2] || 0) << 8) + (data[i + 3] || 0)) >>> 0;
      return total;
    };
    tables.forEach((table, i) => {
      const at = 12 + i * 16;
      view.setUint32(at, table.tag); view.setUint32(at + 4, sum(table.data));
      view.setUint32(at + 8, table.offset); view.setUint32(at + 12, table.data.length);
      output.set(table.data, table.offset);
    });
    const head = tables.find(table => table.tag === 0x68656164);
    if (head) view.setUint32(head.offset + 8, (0xB1B0AFBA - sum(output)) >>> 0);
    return output;
  } catch { return null; }
}
function editorFindFont(doc, page, name) {
  const found = [], visited = new Set();
  const walk = (resources, depth = 0) => {
    if (!resources || depth > 6 || visited.has(resources)) return;
    visited.add(resources);
    const fonts = resources.lookup(N('Font'));
    if (fonts && fonts.entries) for (const [, ref] of fonts.entries()) {
      const dict = doc.context.lookup(ref);
      if (!dict || !dict.lookup) continue;
      const base = editorPdfName(dict.lookup(N('BaseFont')));
      if (base && editorFontName(base) === editorFontName(name)) found.push({ ref, dict, name: base });
    }
    const images = resources.lookup(N('XObject'));
    if (images && images.entries) for (const [, ref] of images.entries()) {
      const object = doc.context.lookup(ref);
      if (object && object.dict) walk(object.dict.lookup(N('Resources')), depth + 1);
    }
  };
  walk(page.node.Resources());
  const exact = found.filter(f => f.name === name);
  return exact[0] || (found.length === 1 ? found[0] : null);
}
function editorUnicodeHex(hex) {
  let result = '';
  for (let i = 0; i + 3 < hex.length; i += 4) result += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
  return result.replace(/^\ufeff/, '');
}
function editorFontCodec(doc, resource) {
  const dict = resource.dict, mapping = new Map();
  const subtype = editorPdfName(dict.lookup(N('Subtype')));
  const encoding = dict.lookup(N('Encoding'));
  const encodingName = editorPdfName(encoding);
  let cid = null;
  if (subtype === 'Type0') {
    if (encodingName !== 'Identity-H') return null;
    const descendants = dict.lookup(N('DescendantFonts'));
    cid = descendants && doc.context.lookup(descendants.get(0));
    if (!cid) return null;
  } else if (!['Type1', 'TrueType', 'MMType1'].includes(subtype)) return null;
  const unicodeBytes = editorDecodeStream(dict.lookup(N('ToUnicode')));
  if (unicodeBytes) {
    const cmap = new TextDecoder('latin1').decode(unicodeBytes);
    for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
      for (const entry of block[1].matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>/gi)) {
        const unicode = editorUnicodeHex(entry[2]);
        if (unicode) mapping.set(unicode, entry[1].toUpperCase());
      }
    }
    for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
      for (const entry of block[1].matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>\s*(<([0-9a-f]+)>|\[([^\]]*)\])/gi)) {
        const first = parseInt(entry[1], 16), last = parseInt(entry[2], 16);
        if (last < first || last - first > 65535) continue;
        const list = entry[5] ? [...entry[5].matchAll(/<([0-9a-f]+)>/gi)].map(v => v[1]) : null;
        for (let code = first; code <= last; code++) {
          const raw = list ? list[code - first] : (BigInt('0x' + entry[4]) + BigInt(code - first)).toString(16).padStart(entry[4].length, '0');
          if (!raw) continue;
          const unicode = editorUnicodeHex(raw);
          if (unicode) mapping.set(unicode, code.toString(16).toUpperCase().padStart(entry[1].length, '0'));
        }
      }
    }
  }
  if (!mapping.size && !cid) {
    const base = encoding && encoding.lookup ? editorPdfName(encoding.lookup(N('BaseEncoding'))) : encodingName;
    const differences = encoding && encoding.lookup && encoding.lookup(N('Differences'));
    if (differences) return null;
    if (base === 'WinAnsiEncoding') for (const [unicode, code] of WIN_MAP) mapping.set(String.fromCodePoint(unicode), code.toString(16).toUpperCase().padStart(2, '0'));
    else if (!encoding || base === 'StandardEncoding') for (let code = 32; code <= 126; code++) mapping.set(String.fromCharCode(code), code.toString(16).toUpperCase().padStart(2, '0'));
  }
  if (!mapping.size) return null;
  const widths = (cid || dict).lookup(N(cid ? 'W' : 'Widths'));
  const firstChar = editorPdfNumber(dict.lookup(N('FirstChar')));
  let standard = null;
  const standardName = resource.name.replace(/^[A-Z]{6}\+/, '');
  if (!cid && !widths) try { standard = PDFLib.StandardFontEmbedder.for(standardName); } catch { /* custom font */ }
  const widthFor = (hex, unicode) => {
    const code = parseInt(hex, 16);
    if (!cid) {
      if (widths && code >= firstChar && code - firstChar < widths.size()) return editorPdfNumber(widths.get(code - firstChar), 500);
      if (standard) try { return standard.widthOfTextAtSize(unicode, 1000); } catch { return 500; }
      const descriptor = dict.lookup(N('FontDescriptor'));
      return descriptor ? editorPdfNumber(descriptor.lookup(N('MissingWidth')), 500) : 500;
    }
    if (widths) for (let i = 0; i < widths.size();) {
      const start = editorPdfNumber(widths.get(i++)), next = widths.get(i++);
      if (next instanceof PDFLib.PDFArray) {
        if (code >= start && code < start + next.size()) return editorPdfNumber(next.get(code - start), 1000);
      } else {
        const end = editorPdfNumber(next), width = editorPdfNumber(widths.get(i++), 1000);
        if (code >= start && code <= end) return width;
      }
    }
    return editorPdfNumber(cid.lookup(N('DW')), 1000);
  };
  const lengths = [...new Set([...mapping.keys()].map(s => s.length))].sort((a, b) => b - a);
  const encode = (text) => {
    const parts = [];
    for (let i = 0; i < text.length;) {
      let hit = null;
      for (const length of lengths) {
        const unicode = text.slice(i, i + length), hex = mapping.get(unicode);
        if (hex) { hit = { hex, unicode, width: widthFor(hex, unicode) }; break; }
      }
      if (!hit) return null;
      parts.push(hit); i += hit.unicode.length;
    }
    return parts;
  };
  const descriptor = (cid || dict).lookup(N('FontDescriptor'));
  const fontFile = descriptor && (descriptor.lookup(N('FontFile2')) || descriptor.lookup(N('FontFile3')));
  const cidMap = cid && cid.lookup(N('CIDToGIDMap'));
  const cidBytes = cidMap && !(cidMap instanceof PDFLib.PDFName) ? editorDecodeStream(cidMap) : null;
  const previewSupported = (text, cmap) => {
    const parts = encode(text);
    return !!parts && parts.every(part => {
      const characters = Array.from(part.unicode);
      if (characters.length !== 1) return false;
      const unicode = characters[0].codePointAt(0), glyph = cmap(unicode), code = parseInt(part.hex, 16);
      if (!glyph) return false;
      if (cid) {
        if (editorPdfName(cid.lookup(N('Subtype'))) !== 'CIDFontType2') return false;
        const sourceGlyph = cidBytes ? ((cidBytes[code * 2] || 0) << 8) | (cidBytes[code * 2 + 1] || 0) : code;
        return glyph === sourceGlyph;
      }
      return encodingName === 'WinAnsiEncoding' || code === unicode || cmap.repaired;
    });
  };
  return { encode, mapping, fontFile, previewSupported };
}
async function editorLoadCompatibleFont(family, bold, italic) {
  if (!['carlito', 'caladea'].includes(family)) return;
  const style = styleKey(bold, italic), key = family + '/' + style;
  if (!editorCompatibleFonts.has(key)) editorCompatibleFonts.set(key, (async () => {
    const data = fontData()[family][style];
    const face = new FontFace('FolioEditor_' + family, fflate.unzlibSync(base64ToBytes(data.ttf)), { weight: bold ? '700' : '400', style: italic ? 'italic' : 'normal' });
    document.fonts.add(await face.load());
  })().catch(() => {}));
  return editorCompatibleFonts.get(key);
}
async function editorMatchedStyle(src, index, seg) {
  const family = familyFromName(seg.font.name, seg.font);
  const mapped = mapFont(family);
  const fallback = seg.font.mono ? 'courier' : mapped.family;
  await editorLoadCompatibleFont(fallback, seg.font.bold, seg.font.italic);
  let key = null, record = null;
  const sourceName = seg.font.sourceName || seg.font.name;
  try {
    const lib = await getLib(src), page = lib && lib.getPage(index);
    const resource = page && editorFindFont(lib, page, sourceName);
    const codec = resource && editorFontCodec(lib, resource);
    if (codec && codec.encode(seg.text)) {
      key = `${src.id}/${index}/${resource.name}`;
      record = editorSourceFonts.get(key);
      if (!record) {
        record = { name: resource.name, codec, fallback, bold: !!seg.font.bold, italic: !!seg.font.italic, css: null };
        // Check the original Unicode-to-glyph mapping before using the embedded
        // font in a text field; CID subsets can use unrelated character codes.
        if (codec.fontFile) try {
          let bytes = editorDecodeStream(codec.fontFile);
          let cmap = bytes && editorTtfCmap(bytes);
          if (cmap && !cmap.hasUnicode) {
            bytes = editorUnicodeFont(bytes, codec) || bytes;
            cmap = editorTtfCmap(bytes);
            if (cmap) cmap.repaired = true;
          }
          if (cmap && codec.previewSupported(seg.text, cmap)) {
            const css = 'FolioSource_' + uid('font');
            const face = new FontFace(css, bytes, { weight: record.bold ? '700' : '400', style: record.italic ? 'italic' : 'normal' });
            document.fonts.add(await face.load()); record.css = JSON.stringify(css);
            record.previewSupported = text => codec.previewSupported(text, cmap);
          }
        } catch { /* use a compatible browser face */ }
        editorSourceFonts.set(key, record);
      }
    }
  } catch (error) { console.warn('Original font unavailable', error); }
  const scale = clamp(seg.horizontalScale || 1, 0.1, 10);
  const parts = record && record.codec.encode(seg.text);
  const natural = parts ? parts.reduce((s, p) => s + p.width * seg.size / 1000, 0) : textWidth(winNormalize(seg.text), { family: fallback, bold: seg.font.bold, italic: seg.font.italic, size: seg.size });
  const spacing = (seg.w / scale - natural) / Math.max(1, parts ? parts.length : Array.from(seg.text).length);
  const tracking = Math.abs(spacing) <= seg.size * 0.35 ? spacing / seg.size : 0;
  return { font: fallback, sourceFontKey: key, sourceFontName: family, horizontalScale: scale, tracking };
}
function editorOriginalFont(o, text = o.text || '') {
  const record = o.sourceFontKey && editorSourceFonts.get(o.sourceFontKey);
  if (!record || o.font !== record.fallback || !!o.bold !== record.bold || !!o.italic !== record.italic) return null;
  return String(text).split('\n').every(line => record.codec.encode(line) !== null) ? record : null;
}
function editorCssFamily(o, text = o.text || '') {
  const record = editorOriginalFont(o, text);
  if (record && record.css && record.previewSupported(String(text).replace(/\n/g, ''))) return record.css;
  if (['carlito', 'caladea'].includes(o.font)) return `"FolioEditor_${o.font}", ${CSS_FAMILY[o.font]}`;
  return CSS_FAMILY[o.font] || CSS_FAMILY.helvetica;
}
function editorTextWidth(o, text) {
  const scale = o.horizontalScale || 1, spacing = (o.tracking || 0) * o.size * scale;
  const original = editorOriginalFont(o, text), parts = original && original.codec.encode(text);
  if (parts) return parts.reduce((s, p) => s + p.width * o.size / 1000 * scale + spacing, 0);
  return textWidth(winNormalize(text), { family: o.font || 'helvetica', bold: o.bold, italic: o.italic, size: o.size, scale, spacing });
}
function editorBaseline(o) { return baselineRatio(o.font || 'helvetica', o.bold, o.italic, editorCssFamily(o)); }
function editorTextAppearance(o, text, scale = 1) {
  const family = editorCssFamily(o, text), tracking = (o.tracking || 0) * o.size;
  const line = String(text || ' ').split('\n').find(s => s) || ' ';
  editorMeasureCtx.font = `${o.italic ? 'italic ' : ''}${o.bold ? 'bold ' : ''}${o.size}px ${family}`;
  editorMeasureCtx.fontKerning = 'none';
  const measured = editorMeasureCtx.measureText(line).width + tracking * Array.from(line).length;
  const desired = editorTextWidth(o, line);
  const horizontal = measured > 0 && desired > 0 ? clamp(desired / measured, 0.1, 10) : 1;
  return { font: `${o.italic ? 'italic ' : ''}${o.bold ? 'bold ' : ''}${o.size * scale}px/${LINE_H} ${family}`, letterSpacing: `${tracking * scale}px`, transform: `scaleX(${horizontal})`, transformOrigin: 'left top', fontKerning: 'none', fontVariantLigatures: 'none' };
}
function editorDrawOriginal(pc, o, lines) {
  const record = editorOriginalFont(o);
  if (!record) return false;
  const resource = editorFindFont(pc.doc, pc.page, record.name);
  if (!resource) return false;
  const encoded = lines.map(line => record.codec.encode(line));
  if (encoded.some(parts => parts === null)) return false;
  const ref = resource.ref instanceof PDFLib.PDFRef ? resource.ref : pc.doc.context.register(resource.dict);
  const name = pc.page.node.newFontDictionary('Original', ref);
  const scale = o.horizontalScale || 1, spacing = (o.tracking || 0) * o.size;
  lines.forEach((line, n) => {
    if (!line) return;
    const y = o.y + editorBaseline(o) * o.size + n * o.size * LINE_H;
    pc.push(`q BT ${name} ${fmtN(o.size)} Tf ${fmtN(scale * 100)} Tz ${fmtN(spacing)} Tc ${(hexColor(o.color)).map(fmtN).join(' ')} rg 1 0 0 -1 ${fmtN(o.x)} ${fmtN(y)} Tm <${encoded[n].map(p => p.hex).join('')}> Tj ET Q`);
  });
  return true;
}
