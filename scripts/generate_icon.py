#!/usr/bin/env python3
"""Generate cricket scorer app icons for App Store and Play Store."""

from PIL import Image, ImageDraw, ImageFilter
import math
import os

SIZE = 1024
HALF = SIZE // 2


def rotate_pts(pts, cx, cy, angle_deg):
    a = math.radians(angle_deg)
    result = []
    for (x, y) in pts:
        dx, dy = x - cx, y - cy
        nx = cx + dx * math.cos(a) - dy * math.sin(a)
        ny = cy + dx * math.sin(a) + dy * math.cos(a)
        result.append((int(nx), int(ny)))
    return result


def draw_gradient_bg(img, size, top_color, bot_color):
    draw = ImageDraw.Draw(img)
    tr, tg, tb = top_color
    br, bg, bb = bot_color
    for y in range(size):
        t = y / size
        r = int(tr + t * (br - tr))
        g = int(tg + t * (bg - tg))
        b = int(tb + t * (bb - tb))
        draw.line([(0, y), (size - 1, y)], fill=(r, g, b, 255))


def draw_ball(img, cx, cy, radius):
    # Shadow
    shadow = Image.new('RGBA', img.size, (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow)
    sdraw.ellipse(
        [cx - radius + 18, cy - radius + 18, cx + radius + 18, cy + radius + 18],
        fill=(0, 0, 0, 85)
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(24))
    img.alpha_composite(shadow)

    # Ball body with radial lighting
    for iy in range(cy - radius, cy + radius + 1):
        for ix in range(cx - radius, cx + radius + 1):
            dx = ix - cx
            dy = iy - cy
            d = math.sqrt(dx * dx + dy * dy)
            if d <= radius:
                light = ((-dx * 0.55 - dy * 0.75) / radius + 0.5)
                light = max(0.0, min(1.0, light))
                r = int(130 + light * 90)
                g = int(8 + light * 18)
                b = int(8 + light * 12)
                img.putpixel((ix, iy), (r, g, b, 255))

    draw = ImageDraw.Draw(img)

    # Seam (equatorial oval band)
    si = int(radius * 0.18)
    seam_col = (235, 225, 205)
    sw = max(4, radius // 28)
    draw.arc([cx - radius + si, cy - radius // 2,
              cx + radius - si, cy + radius // 2],
             start=195, end=345, fill=seam_col, width=sw)
    draw.arc([cx - radius + si, cy - radius // 2,
              cx + radius - si, cy + radius // 2],
             start=15, end=165, fill=seam_col, width=sw)

    # Stitch dots
    for arc_start, arc_end in [(195, 345), (15, 165)]:
        for j in range(7):
            ang = math.radians(arc_start + j * (arc_end - arc_start) / 6)
            bx = cx + int((radius - si) * math.cos(ang) * 0.80)
            by = cy + int((radius // 2) * math.sin(ang) * 0.80)
            draw.ellipse([bx - sw, by - sw, bx + sw, by + sw], fill=seam_col)

    # Specular highlight
    hl = Image.new('RGBA', img.size, (0, 0, 0, 0))
    hdraw = ImageDraw.Draw(hl)
    hl_r = radius // 5
    hl_x = cx - radius // 3
    hl_y = cy - radius // 3
    hdraw.ellipse([hl_x - hl_r, hl_y - hl_r, hl_x + hl_r, hl_y + hl_r],
                  fill=(255, 255, 255, 200))
    hl = hl.filter(ImageFilter.GaussianBlur(hl_r // 2 + 1))
    img.alpha_composite(hl)


def bat_polygon(cx, cy):
    """Proper cricket bat proportions. Handle at top, toe at bottom."""
    # Handle: thin, ~29% of total bat length
    # Blade: flat, ~71%, width ~13% of total length
    # Using 800px total bat height
    total_h = 800
    handle_h = int(total_h * 0.30)
    blade_h = int(total_h * 0.65)
    shoulder_h = total_h - handle_h - blade_h

    handle_hw = 28      # handle half-width
    shoulder_hw = 80    # shoulder half-width (where handle meets blade)
    blade_hw = 105      # blade max half-width

    top = cy - total_h // 2
    shoulder_y = top + handle_h
    blade_top_y = shoulder_y + shoulder_h
    blade_bot_y = blade_top_y + blade_h

    return [
        (cx - handle_hw, top),              # handle top-left
        (cx + handle_hw, top),              # handle top-right
        (cx + handle_hw, shoulder_y - 20),  # handle lower-right
        (cx + shoulder_hw, blade_top_y),    # shoulder right
        (cx + blade_hw, blade_top_y + 60),  # blade upper-right
        (cx + blade_hw, blade_bot_y - 70),  # blade lower-right
        (cx + blade_hw // 2, blade_bot_y + 20),  # toe right
        (cx, blade_bot_y + 50),             # toe tip
        (cx - blade_hw // 2, blade_bot_y + 20),  # toe left
        (cx - blade_hw, blade_bot_y - 70),  # blade lower-left
        (cx - blade_hw, blade_top_y + 60),  # blade upper-left
        (cx - shoulder_hw, blade_top_y),    # shoulder left
        (cx - handle_hw, shoulder_y - 20),  # handle lower-left
    ], (top, shoulder_y, blade_top_y, blade_bot_y, handle_hw, shoulder_hw, blade_hw)


def draw_bat(img, cx, cy, angle_deg):
    pts, dims = bat_polygon(cx, cy)
    top, shoulder_y, blade_top_y, blade_bot_y, handle_hw, shoulder_hw, blade_hw = dims
    rotated = rotate_pts(pts, cx, cy, angle_deg)

    # Drop shadow
    shadow = Image.new('RGBA', img.size, (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow)
    sdraw.polygon([(x + 22, y + 22) for x, y in rotated], fill=(0, 0, 0, 100))
    shadow = shadow.filter(ImageFilter.GaussianBlur(26))
    img.alpha_composite(shadow)

    # --- Draw bat onto its own layer so we can mask grain lines ---
    bat_layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    bdraw = ImageDraw.Draw(bat_layer)

    # Main bat fill (willow/cream)
    bdraw.polygon(rotated, fill=(245, 238, 210, 255))

    # Grain lines clipped by bat mask
    grain_layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(grain_layer)
    for i in range(-5, 6):
        gx = cx + i * 19
        g_top = (gx, blade_top_y + 20)
        g_bot = (gx, blade_bot_y + 40)
        gr = rotate_pts([g_top, g_bot], cx, cy, angle_deg)
        gdraw.line(gr, fill=(210, 198, 155, 220), width=2)

    # Mask: only show grain inside bat
    mask = Image.new('L', img.size, 0)
    maskdraw = ImageDraw.Draw(mask)
    maskdraw.polygon(rotated, fill=255)
    grain_masked = Image.new('RGBA', img.size, (0, 0, 0, 0))
    grain_masked.paste(grain_layer, mask=mask)
    bat_layer.alpha_composite(grain_masked)

    # Outer edge
    bdraw.polygon(rotated, outline=(175, 155, 100, 255), width=5)

    # Shoulder shading
    shoulder_shade_pts = [
        (cx - shoulder_hw, blade_top_y),
        (cx + shoulder_hw, blade_top_y),
        (cx + blade_hw, blade_top_y + 80),
        (cx - blade_hw, blade_top_y + 80),
    ]
    rs = rotate_pts(shoulder_shade_pts, cx, cy, angle_deg)
    shade_layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    shade_draw = ImageDraw.Draw(shade_layer)
    shade_draw.polygon(rs, fill=(0, 0, 0, 35))
    shade_masked = Image.new('RGBA', img.size, (0, 0, 0, 0))
    shade_masked.paste(shade_layer, mask=mask)
    bat_layer.alpha_composite(shade_masked)

    img.alpha_composite(bat_layer)

    draw = ImageDraw.Draw(img)

    # Handle grip (dark rubber)
    grip_top = top
    grip_bot = shoulder_y - 30
    grip_pts = [
        (cx - handle_hw + 2, grip_top),
        (cx + handle_hw - 2, grip_top),
        (cx + handle_hw - 2, grip_bot),
        (cx - handle_hw + 2, grip_bot),
    ]
    rotated_grip = rotate_pts(grip_pts, cx, cy, angle_deg)
    draw.polygon(rotated_grip, fill=(28, 18, 10, 255))

    # Grip wrap lines
    grip_height = grip_bot - grip_top
    for i in range(int(grip_height / 16) + 1):
        gy = grip_top + i * 16
        if gy >= grip_bot:
            break
        line_pts = [(cx - handle_hw + 2, gy), (cx + handle_hw - 2, gy + 8)]
        rl = rotate_pts(line_pts, cx, cy, angle_deg)
        draw.line(rl, fill=(55, 40, 22, 255), width=3)

    # Grip end cap
    cap = [
        (cx - handle_hw + 2, grip_top),
        (cx + handle_hw - 2, grip_top),
        (cx + handle_hw - 4, grip_top + 18),
        (cx - handle_hw + 4, grip_top + 18),
    ]
    draw.polygon(rotate_pts(cap, cx, cy, angle_deg), fill=(15, 10, 5, 255))


def generate_icon(with_bg=True):
    img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))

    if with_bg:
        draw_gradient_bg(img, SIZE, (18, 30, 65), (10, 18, 48))

    # Bat: centered, slightly left, angled 20° CCW (handle up-left, toe down-right)
    bat_cx = HALF - 20
    bat_cy = HALF + 40
    draw_bat(img, bat_cx, bat_cy, -20)

    # Ball: upper-right, near where the bat shoulder area is
    ball_cx = HALF + 270
    ball_cy = HALF - 230
    ball_r = 148
    draw_ball(img, ball_cx, ball_cy, ball_r)

    return img


def generate_monochrome():
    img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 255))
    draw = ImageDraw.Draw(img)

    bat_cx = HALF - 20
    bat_cy = HALF + 40
    pts, _ = bat_polygon(bat_cx, bat_cy)
    rotated = rotate_pts(pts, bat_cx, bat_cy, -20)
    draw.polygon(rotated, fill='white')

    ball_cx = HALF + 270
    ball_cy = HALF - 230
    ball_r = 148
    draw.ellipse([ball_cx - ball_r, ball_cy - ball_r,
                  ball_cx + ball_r, ball_cy + ball_r],
                 fill='white')
    return img


if __name__ == '__main__':
    assets = '/Users/sumanth/Projects/cricket-scorer-app/assets'

    print('Generating icon.png ...')
    icon = generate_icon(with_bg=True)
    icon.save(os.path.join(assets, 'icon.png'))

    print('Generating android-icon-foreground.png ...')
    fg = generate_icon(with_bg=False)
    fg.save(os.path.join(assets, 'android-icon-foreground.png'))

    print('Generating android-icon-background.png ...')
    bg = Image.new('RGBA', (SIZE, SIZE), (18, 30, 65, 255))
    draw_gradient_bg(bg, SIZE, (18, 30, 65), (10, 18, 48))
    bg.save(os.path.join(assets, 'android-icon-background.png'))

    print('Generating android-icon-monochrome.png ...')
    mono = generate_monochrome()
    mono.save(os.path.join(assets, 'android-icon-monochrome.png'))

    print('Generating favicon.png (64×64) ...')
    favicon = generate_icon(with_bg=True).resize((64, 64), Image.LANCZOS)
    favicon.save(os.path.join(assets, 'favicon.png'))

    print('Done.')
