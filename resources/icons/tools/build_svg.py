# Builds every Inkleaf SVG master: the app icon, the small-size companion,
# the tray glyph and the two lockups. Run from the repo root:
#     python resources/icons/tools/build_svg.py
import io
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from stamp import stamp  # noqa: E402

from fontTools.misc.transform import Transform
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

# Noto Serif SC is SIL OFL 1.1: outlining glyphs and shipping the paths is
# permitted, commercial use included. Override with INKLEAF_FONT if the Windows
# system copy is not present.
FONT = os.environ.get("INKLEAF_FONT", "C:/Windows/Fonts/NotoSerifSC-VF.ttf")
OUT = os.path.join("resources", "icons")

GRAPHITE = "#30343B"
WARMWHITE = "#F6F2EA"
PAPER_EDGE = "#E1DACA"

# Where the block did not take ink. Fixed values, so every rebuild is identical.
WEAR = ((0.11, 0.015, 8), (0.39, 0.012, 6), (0.63, 0.017, 9), (0.86, 0.010, 6))

TRAY_SQUARE = ("M1.6 2.8 A1.2 1.2 0 0 1 2.8 1.6 L13.2 1.6 A1.2 1.2 0 0 1 14.4 2.8 "
               "L14.4 13.2 A1.2 1.2 0 0 1 13.2 14.4 L2.8 14.4 A1.2 1.2 0 0 1 1.6 13.2 Z")

PLATE = ('<rect x="100" y="100" width="824" height="824" rx="188" fill="%s"/>'
         '<rect x="104" y="104" width="816" height="816" rx="184" fill="none" '
         'stroke="%s" stroke-width="8"/>' % (WARMWHITE, PAPER_EDGE))

_fonts = {}


def font(weight):
    if weight not in _fonts:
        _fonts[weight] = instantiateVariableFont(TTFont(FONT), {"wght": weight}, inplace=True)
    return _fonts[weight]


def bounds(ch, weight):
    f = font(weight)
    bp = BoundsPen(f.getGlyphSet())
    f.getGlyphSet()[f.getBestCmap()[ord(ch)]].draw(bp)
    return bp.bounds


def fit(ch, box, weight, max_stretch=1.10):
    """Path data for a glyph squared up to fill box, the way a seal carver fills
    the face. Horizontal and vertical scale may diverge by max_stretch."""
    gx0, gy0, gx1, gy1 = bounds(ch, weight)
    bx0, by0, bx1, by1 = box
    base = min((bx1 - bx0) / (gx1 - gx0), (by1 - by0) / (gy1 - gy0))
    sx = min((bx1 - bx0) / (gx1 - gx0), base * max_stretch)
    sy = min((by1 - by0) / (gy1 - gy0), base * max_stretch)
    tx = bx0 + ((bx1 - bx0) - sx * (gx1 - gx0)) / 2 - sx * gx0
    ty = by0 + ((by1 - by0) - sy * (gy1 - gy0)) / 2 + sy * gy1
    f = font(weight)
    gs = f.getGlyphSet()
    rec = RecordingPen()
    gs[f.getBestCmap()[ord(ch)]].draw(rec)
    sp = SVGPathPen(gs)
    rec.replay(TransformPen(sp, Transform().translate(tx, ty).scale(sx, -sy)))
    return sp.getCommands()


def seal(box, glyph_box, weight, amp, wear):
    """Ink block with the character lifted out of it.

    The glyph is painted over the block in the paper colour rather than cut with
    an even-odd rule. CJK outlines carry overlapping stroke contours, and even-odd
    would XOR them into holes wherever two strokes cross.
    """
    x0, y0, x1, y1 = box
    return ('<path fill="%s" d="%s"/><path fill="%s" d="%s"/>'
            % (GRAPHITE, stamp(x0, y0, x1, y1, amp=amp, step=12, bites=wear, phase=0.6),
               WARMWHITE, fit("印", glyph_box, weight)))


def write(name, text):
    path = os.path.join(OUT, name)
    io.open(path, "w", encoding="utf-8", newline="\n").write(text)
    print("wrote", path)


def square_icon(name, body, title, desc):
    write(name,
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" '
          'height="1024" role="img" aria-label="Inkleaf">\n'
          '  <title>%s</title>\n  <desc>%s</desc>\n  %s\n</svg>\n' % (title, desc, body))


def build_tray():
    glyph = fit("印", (3.75, 3.75, 12.25, 12.25), 900, max_stretch=1.16)
    lines = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" '
        'role="img" aria-label="Inkleaf">',
        '  <title>Inkleaf tray</title>',
        '  <desc>Drawn on a 16-unit grid, not reduced from the master. The character is masked '
        'out rather than painted, so the glyph takes one inherited colour and the cut-away '
        'strokes stay transparent.</desc>',
        '  <mask id="inkleafTray" maskUnits="userSpaceOnUse" x="0" y="0" width="16" height="16">',
        '    <path fill="#fff" d="%s"/>' % TRAY_SQUARE,
        '    <path fill="#000" d="%s"/>' % glyph,
        '  </mask>',
        '  <rect width="16" height="16" fill="currentColor" mask="url(#inkleafTray)"/>',
        '</svg>',
        '',
    ]
    write("inkleaf-tray.svg", "\n".join(lines))


def word(text, left, baseline, size, weight, tracking=0.0, fill="#26292F"):
    f = font(weight)
    gs, cmap = f.getGlyphSet(), f.getBestCmap()
    s = size / 1000.0
    x, parts = 0.0, []
    for ch in text:
        name = cmap[ord(ch)]
        rec = RecordingPen()
        gs[name].draw(rec)
        sp = SVGPathPen(gs)
        rec.replay(TransformPen(sp, Transform().translate(left, baseline).scale(s, -s).translate(x, 0)))
        parts.append(sp.getCommands())
        x += gs[name].width + tracking
    return '<path fill="%s" d="%s"/>' % (fill, " ".join(parts))


def lockup(name, primary, secondary, sec_size, sec_track, width):
    mark = '<g transform="scale(0.1171875)">%s%s</g>' % (
        PLATE, seal((212, 212, 812, 812), (302, 302, 722, 722), 700, 2.3, WEAR))
    body = mark + word(primary, 152, 80, 60, 600) \
        + word(secondary, 154, 112, sec_size, 400, sec_track, "#6C727A")
    write(name,
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d 128" width="%d" height="128" '
          'role="img" aria-label="%s">\n  <title>%s</title>\n  %s\n</svg>\n'
          % (width, width, primary, primary, body))


def main():
    square_icon(
        "inkleaf.svg",
        PLATE + seal((212, 212, 812, 812), (302, 302, 722, 722), 700, 2.3, WEAR),
        "Inkleaf",
        "Yinye / Inkleaf. A worn ink seal on paper carrying the character yin, to print. "
        "Outlines only, no font dependency. Glyph from Noto Serif SC, SIL OFL 1.1.")

    square_icon(
        "inkleaf-small.svg",
        PLATE + seal((184, 184, 840, 840), (272, 272, 752, 752), 820, 0.9, ()),
        "Inkleaf, small sizes",
        "Hand-tuned companion for 16 and 24 px: heavier glyph, larger seal, edge wear removed "
        "because at that size wear reads as damage rather than as craft.")

    build_tray()
    lockup("inkleaf-lockup-zh.svg", "印页", "让文字成页", 20, 60, 420)
    lockup("inkleaf-lockup-en.svg", "Inkleaf", "Markdown to PDF, locally", 19, 24, 470)
    print("done")


if __name__ == "__main__":
    main()
