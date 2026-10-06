"""Static-host fixes for HTTrack Wix exports on Amplify.

1. Wix dropdown menus (StylableHorizontalMenu) only open after Thunderbolt hydration,
   which never completes on a static host (clientWorker/_api 404s). Inject CSS that
   opens submenus on :hover/:focus-within and a tiny JS tap/click toggle for touch.
2. Footer slider gallery arrows overhang the viewport -> horizontal scrollbar; clip it.
3. Export is the 980px desktop layout but viewport meta is device-width/initial-scale=1,
   so phones show a clipped page with horizontal scrolling and off-screen menu items.
   Use width=980 so mobile browsers fit the layout to the screen.

Idempotent: re-running replaces the injected block.
Usage: python fix_static_nav.py <site_root> [<site_root> ...]
"""
import os, re, sys

MARK_START = "<!-- static-nav-fix:start -->"
MARK_END = "<!-- static-nav-fix:end -->"
CSS = '/* cm-static-nav: static-host fallback for Wix dropdown menu (Thunderbolt hydration unavailable) */\nli[data-testid="menuItemDepth0"]{position:relative}\nli[data-testid="menuItemDepth0"]:hover>[data-testid="positionBox"],li[data-testid="menuItemDepth0"]:focus-within>[data-testid="positionBox"],li[data-testid="menuItemDepth0"][data-cm-open]>[data-testid="positionBox"]{display:block!important;visibility:visible!important;position:absolute!important;top:100%!important;left:0!important;right:auto!important;min-width:100%;z-index:1000!important}\nli[data-testid="menuItemDepth0"]:hover>[data-testid="positionBox"]>*,li[data-testid="menuItemDepth0"]:focus-within>[data-testid="positionBox"]>*,li[data-testid="menuItemDepth0"][data-cm-open]>[data-testid="positionBox"]>*{opacity:1!important;visibility:visible!important;animation:none!important}\nli[data-testid="menuItemDepth0"] [role="button"][aria-haspopup]{cursor:pointer}\n/* Footer slider-gallery arrows overhang the viewport by ~5px -> horizontal scrollbar. clip (not hidden) keeps sticky/scroll behaviour intact. */\n#SITE_FOOTER{overflow-x:clip}'
JS = '(function(){function c(e){return e&&e.closest&&e.closest(\'li[data-testid="menuItemDepth0"]\')}\nfunction closeAll(x){document.querySelectorAll(\'li[data-cm-open]\').forEach(function(l){if(l!==x){l.removeAttribute(\'data-cm-open\');var b=l.querySelector(\'[aria-haspopup]\');b&&b.setAttribute(\'aria-expanded\',\'false\')}})}\ndocument.addEventListener(\'click\',function(e){var t=e.target.closest&&e.target.closest(\'[role="button"][aria-haspopup],button[aria-label^="Toggle "]\');var li=c(t);if(t&&li&&li.querySelector(\'[data-testid="positionBox"]\')){e.preventDefault();e.stopPropagation();var o=li.hasAttribute(\'data-cm-open\');closeAll(li);if(o){li.removeAttribute(\'data-cm-open\')}else{li.setAttribute(\'data-cm-open\',\'\')}var b=li.querySelector(\'[aria-haspopup]\');b&&b.setAttribute(\'aria-expanded\',o?\'false\':\'true\');return}if(!c(e.target))closeAll(null)},true);\ndocument.addEventListener(\'keydown\',function(e){if(e.key===\'Escape\')closeAll(null);if((e.key===\'Enter\'||e.key===\' \')&&e.target.matches&&e.target.matches(\'[role="button"][aria-haspopup]\')){e.preventDefault();e.target.click()}},true)})();'
BLOCK = MARK_START + "<style id=\"static-nav-fix\">" + CSS + "</style><script id=\"static-nav-fix-js\">" + JS + "</script>" + MARK_END
VP_RE = re.compile(r'<meta name="viewport" content="[^"]*" id="wixDesktopViewport"\s*/?>')
VP_NEW = '<meta name="viewport" content="width=980" id="wixDesktopViewport" />'

def fix(path):
    with open(path, encoding="utf-8", newline="") as f:
        h = f.read()
    if "wixDesktopViewport" not in h:
        return False
    o = h
    h = re.sub(re.escape(MARK_START) + ".*?" + re.escape(MARK_END), "", h, flags=re.S)
    h = VP_RE.sub(VP_NEW, h, count=1)
    i = h.find("</head>")
    if i < 0:
        return False
    h = h[:i] + BLOCK + h[i:]
    if h != o:
        with open(path, "w", encoding="utf-8", newline="") as f:
            f.write(h)
        return True
    return False

for root in sys.argv[1:]:
    n = 0
    for dp, dn, fn in os.walk(root):
        for f in fn:
            if f.endswith(".html") and fix(os.path.join(dp, f)):
                n += 1
                print("fixed", os.path.join(dp, f))
    print(root, "->", n, "files")
