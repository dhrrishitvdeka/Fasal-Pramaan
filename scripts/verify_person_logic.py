"""Offline check of the new person-decision logic in cv-core.ts (no Node needed).

Replicates: skin rule from classifyAgriculturalPixel, Laplacian accumulation
over skin pixels, and the isPersonDetected decision from analyzeFrame.
"""

W = H = 32


def rgb_to_hsv(r, g, b):
    mx, mn = max(r, g, b), min(r, g, b)
    d = mx - mn
    v = mx / 255
    s = 0 if mx == 0 else d / mx
    h = 0.0
    if d != 0:
        if mx == r:
            h = ((g - b) / d + (6 if g < b else 0)) * 60
        elif mx == g:
            h = ((b - r) / d + 2) * 60
        else:
            h = ((r - g) / d + 4) * 60
    return h, s, v


def is_skin(r, g, b):
    if r + g + b == 0:
        return False
    h, s, v = rgb_to_hsv(r, g, b)
    return (
        r > g
        and g > b
        and 12 <= r - g <= 110
        and g - b <= 65
        and 0.15 <= s <= 0.7
        and (h <= 35 or h >= 335)
        and 0.16 <= v <= 0.95
    )


def lum(p):
    return 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]


def analyze(pix, veto=False, confirm=False):
    # Mirror analyzeFrame: skin counted over ALL pixels, Laplacian interior-only.
    skin_all = 0
    total = 0
    for y in range(H):
        for x in range(W):
            total += 1
            if is_skin(*pix[y][x]):
                skin_all += 1
    laps = []
    for y in range(1, H - 1):
        for x in range(1, W - 1):
            if is_skin(*pix[y][x]):
                lap = abs(
                    4 * lum(pix[y][x])
                    - lum(pix[y][x - 1])
                    - lum(pix[y][x + 1])
                    - lum(pix[y - 1][x])
                    - lum(pix[y + 1][x])
                )
                laps.append(lap)
    skin_ratio = skin_all / total
    # Grain FRACTION (not mean) — boundary ring between subject and background
    # must not dominate, mirroring cv-core.ts SKIN_WOOD_GRAIN_* logic.
    grainy = len(laps) > 30 and sum(1 for v in laps if v > 5) / len(laps) > 0.5
    suspect = skin_ratio > 0.04
    strong = skin_ratio > 0.12
    if confirm:
        person = suspect
    elif veto:
        person = False
    else:
        person = strong and not grainy
    mean_lap = sum(laps) / len(laps) if laps else 0.0
    return skin_ratio, mean_lap, person


def grain(t, base):
    v = base + t
    return max(0, min(255, v))


def frame_desk_grain():
    return [
        [
            (
                grain((x * 11 + y * 17) % 25 - 12, 150),
                grain((x * 11 + y * 17) % 25 - 12, 110),
                grain((x * 11 + y * 17) % 25 - 12, 70),
            )
            for x in range(W)
        ]
        for y in range(H)
    ]


def frame_flat_brown():
    return [[(170, 120, 90) for _ in range(W)] for _ in range(H)]


def frame_skin6():
    return [
        [(170, 120, 90) if x < W * 0.06 else (165, 175, 165) for x in range(W)]
        for y in range(H)
    ]


def frame_person40():
    return [
        [
            (170, 120, 90) if (0.25 * W <= x <= 0.75 * W and y >= 0.2 * H) else (165, 175, 165)
            for x in range(W)
        ]
        for y in range(H)
    ]


ratio, lap, person = analyze(frame_desk_grain())
print(f"desk+grain, no-model:      ratio={ratio:.3f} lap={lap:.2f} person={person}")
assert person is False, "grainy wooden desk must NOT be flagged as person"

ratio, lap, person = analyze(frame_flat_brown(), veto=True)
print(f"flat brown + model veto:   ratio={ratio:.3f} person={person}")
assert person is False, "model veto (desk/laptop) must suppress the person flag"

ratio, lap, person = analyze(frame_skin6(), confirm=True)
print(f"skin 6% + model confirms:  ratio={ratio:.3f} person={person}")
assert person is True, "model-confirmed person must be flagged even at low skin ratio"

ratio, lap, person = analyze(frame_person40())
print(f"person 40% flat, no-model: ratio={ratio:.3f} lap={lap:.2f} person={person}")
assert person is True, "strong flat skin coverage must still be flagged (existing test)"

ratio, lap, person = analyze(frame_flat_brown())
print(f"flat brown, heuristic-only: ratio={ratio:.3f} person={person}")

print("ALL_PERSON_DECISION_CHECKS_PASS")
