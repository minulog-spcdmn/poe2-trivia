# A window's own pixels as Windows composites them (PrintWindow, its full
# content), wherever it lies and whatever covers it, cut to a box given in
# the screen's device pixels: what firefox.mjs shoots a page with. A
# browser's own screenshot draws the page again for the shot, and may draw
# it better than the screen has it (Firefox smooths a tilted card's edge
# there that it shows in steps).
#   python scripts/pc/window.py <part of the window's title> <out.png> <x> <y> <width> <height>
import ctypes
import sys
from ctypes import wintypes

from PIL import Image

# (Device pixels, whatever the screen's scale.)
ctypes.windll.shcore.SetProcessDpiAwareness(2)
user, gdi = ctypes.windll.user32, ctypes.windll.gdi32
title, out = sys.argv[1], sys.argv[2]
x, y, w, h = map(int, sys.argv[3:7])

found = []


@ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
def each(hwnd, _):
    text = ctypes.create_unicode_buffer(512)
    user.GetWindowTextW(hwnd, text, 512)
    if title in text.value and user.IsWindowVisible(hwnd):
        found.append(hwnd)
    return True


user.EnumWindows(each, 0)
if not found:
    sys.exit(f'no window titled "{title}"')
hwnd = found[0]
box = wintypes.RECT()
user.GetWindowRect(hwnd, ctypes.byref(box))
width, height = box.right - box.left, box.bottom - box.top

window = user.GetWindowDC(hwnd)
memory = gdi.CreateCompatibleDC(window)
bitmap = gdi.CreateCompatibleBitmap(window, width, height)
gdi.SelectObject(memory, bitmap)
# (2: PW_RENDERFULLCONTENT, the GPU's layers too.)
if not user.PrintWindow(hwnd, memory, 2):
    sys.exit("the window wouldn't print")


class Header(ctypes.Structure):
    _fields_ = [
        ('size', wintypes.DWORD),
        ('width', wintypes.LONG),
        ('height', wintypes.LONG),
        ('planes', wintypes.WORD),
        ('bits', wintypes.WORD),
        ('compression', wintypes.DWORD),
        ('image', wintypes.DWORD),
        ('xppm', wintypes.LONG),
        ('yppm', wintypes.LONG),
        ('used', wintypes.DWORD),
        ('important', wintypes.DWORD),
    ]


# (Top row first: a negative height.)
header = Header(ctypes.sizeof(Header), width, -height, 1, 32, 0, 0, 0, 0, 0, 0)
pixels = ctypes.create_string_buffer(width * height * 4)
gdi.GetDIBits(memory, bitmap, 0, height, pixels, ctypes.byref(header), 0)
gdi.DeleteObject(bitmap)
gdi.DeleteDC(memory)
user.ReleaseDC(hwnd, window)

left, top = x - box.left, y - box.top
Image.frombuffer('RGBA', (width, height), pixels, 'raw', 'BGRA', 0, 1).convert('RGB').crop((left, top, left + w, top + h)).save(out)
