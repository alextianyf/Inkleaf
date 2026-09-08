# Generates a stamped-edge rectangle: an ink impression, not a UI rectangle.
# The wobble is a sum of integer-frequency sinusoids so the outline closes
# seamlessly, plus a few localised bites where the block did not take ink.
import math

def stamp(x0, y0, x1, y1, amp=8.0, step=14.0, bites=(), phase=0.0, harmonics=((3,1.0),(7,0.55),(13,0.3))):
    w, h = x1 - x0, y1 - y0
    edges = [
        ((x0, y0), (x1, y0), (0, -1)),
        ((x1, y0), (x1, y1), (1, 0)),
        ((x1, y1), (x0, y1), (0, 1)),
        ((x0, y1), (x0, y0), (-1, 0)),
    ]
    per = 2 * (w + h)
    pts, run = [], 0.0
    for (ax, ay), (bx, by), (nx, ny) in edges:
        seg = math.hypot(bx - ax, by - ay)
        n = max(2, int(seg / step))
        for i in range(n):
            f = i / n
            px, py = ax + (bx - ax) * f, ay + (by - ay) * f
            t = (run + seg * f) / per
            off = sum(a * math.sin(2 * math.pi * k * t + phase * k) for k, a in harmonics) * amp
            for bt, bw, bd in bites:
                d = min(abs(t - bt), 1 - abs(t - bt))
                off -= bd * math.exp(-(d / bw) ** 2)
            pts.append((px + nx * off, py + ny * off))
        run += seg
    return "M" + " L".join("%.1f %.1f" % p for p in pts) + " Z"

def voids(specks):
    return " ".join('<circle cx="%g" cy="%g" r="%g"/>' % s for s in specks)

def columns(x0, y0, x1, y1, depths, gap_ratio=0.72):
    n = len(depths)
    total = x1 - x0
    w = total / (n + (n - 1) * gap_ratio)
    g = w * gap_ratio
    out = []
    for i, d in enumerate(depths):
        cx = x0 + i * (w + g)
        out.append('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f"/>'
                   % (cx, y0, w, (y1 - y0) * d, w * 0.14))
    return "".join(out)
