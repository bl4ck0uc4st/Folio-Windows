# Folio Windows

Offline PDF tools for Windows, maintained by [Vraj Patel](https://github.com/bl4ck0uc4st).

Merge, split, edit, sign, compress, and convert documents on your own computer. The application is a self-contained HTML file with its PDF libraries and fonts included. It runs in Microsoft Edge or Google Chrome without an installer, account, or server.

## Download and open

1. [Download Folio-Windows.zip](https://github.com/bl4ck0uc4st/Folio-Windows/raw/refs/heads/main/dist/Folio-Windows.zip).
2. Right-click the ZIP and choose **Extract All**.
3. Open **Start-Folio.cmd**, or open **Folio-Windows.html** with Edge or Chrome.
4. Choose a tool and add your files.

The launcher selects an installed Edge or Chrome browser. It does not install software or request administrator access. You can also use the HTML file by itself.

## Personal greeting

Open **Start-Folio.cmd** to detect the Windows PC name locally. The home page shows **Good morning**, **Good afternoon**, or **Good evening** using that computer's local time, and updates while the app remains open.

Choose **Personalize** beside the greeting to use your own display name instead. Leave it blank to return to the detected PC name. The name is saved only in that browser on that PC. Opening the HTML directly uses the last saved name; a browser cannot read the Windows computer name on its own.

## Edit existing text

Choose **Edit PDF → Edit text**, then select the words to change. The editor keeps the original font when its replacement characters are available, together with the fractional font size, colour, baseline, horizontal scaling, and character spacing. Adjacent words with different fonts or styles stay separate.

Clicking a line and leaving it unchanged does not replace it or add an undo step. If an embedded font subset lacks a new character, the editor uses a compatible font for that replacement.

## Tools

| Group | Tools |
| --- | --- |
| Organize | Merge PDFs and images, split or extract pages, delete pages, reorder, rotate, crop |
| Edit and sign | Edit text, add notes, highlight, draw, add shapes or pictures, white-out, redact, sign, add page numbers |
| Optimize | Compress PDF |
| Convert to PDF | Images, local scan/photo cleanup, Word, PowerPoint, Excel, CSV/TSV |
| Convert from PDF | JPG/PNG, Word, PowerPoint, Excel |

## Privacy and local storage

- All document processing happens in your browser on your computer.
- The page's Content Security Policy blocks internet, local-network, and localhost connections. Only in-memory `blob:` and `data:` resources are allowed for connection requests.
- All tools work with Wi-Fi turned off. There is no phone-scanning helper or pairing server.
- Opened documents are held in memory. Close all Folio windows when finished.
- Tool preferences stay in your browser. Signatures are remembered only when you select **Remember on this PC**. The privacy stamp includes a control to forget saved signatures.
- Save the app and exported files outside OneDrive, Dropbox, network shares, and other synchronized folders if you want them only on this computer.

The app uses your browser's download controls. Enable the browser's option to ask where to save downloads if you want to choose a folder each time. Browser extensions, Windows, and backup or sync software have their own settings.

## Windows shortcuts

| Shortcut | Action |
| --- | --- |
| Ctrl+O | Add files to the current tool |
| Ctrl+K | Find a tool |
| / | Find a tool from the home screen |
| Ctrl+Z | Undo in the editor or page organizer |
| Ctrl+Shift+Z | Redo in the editor |
| Ctrl+Y | Redo in the editor |
| Ctrl+D | Duplicate the selected annotation |
| Delete | Remove a selected annotation or page where supported |

## Scans

Save scans or document photos to your PC as JPG/PNG files. Open **Scan to PDF**, add the images, adjust corners, choose a cleanup style, and create the PDF. Pages can be reordered and rotated locally.

## Limitations

- Office conversion reconstructs layouts. Complex documents can differ from Microsoft Office's own PDF export.
- Unsupported Office charts and EMF/WMF pictures can appear as placeholders.
- Scanned PDFs need an existing text layer for editable text extraction; OCR is not included.
- Convert unsupported HEIC photos to JPG or PNG before importing.
- Remove password protection from Office files before importing.
- Drawn or typed signatures are visual signatures, not certificate-based cryptographic signatures.

## Validation

Testing covers all 18 tool screens, document workflows, Windows keyboard shortcuts, signature storage controls, offline reload/export, and blocked network connections. Additional greeting and text-editing tests check PC-name personalization, live local-time changes, original-font reuse for standard, embedded, and CID fonts, exact sizes and baselines, style boundaries, and undo/redo. Exported files are checked with independent PDF and Office readers. See [CHECKS.txt](CHECKS.txt) for the current results.

Tests ran in Chromium 153 on Linux with a Windows browser user agent. Windows itself and the Windows launcher were not available for execution. See [CHECKS.txt](CHECKS.txt) for details.

## Source and rebuilding

This edition adapts [Folio](https://github.com/bl4ck0uc4st/folio) at commit `1c4edf9a3542ccf86e14593af7c030b00f7f93ef`. The application source and bundled libraries are also present inside `Folio-Windows.html`.

To rebuild the Windows adaptation, obtain the upstream repository at that commit and run:

```powershell
python source\build_windows.py C:\path\to\folio C:\path\to\output
```

Python and the upstream source are only needed for rebuilding. Normal use requires just the HTML file and a browser.

See [CREDITS.txt](CREDITS.txt) for upstream and bundled-project attribution.

### Run the greeting and text-matching tests

These tools are needed only for development:

```sh
npm install
npx playwright install chromium
python -m pip install -r tests/requirements.txt
python tests/make_matching_fixtures.py
npm test
python tests/verify_matching.py
```
