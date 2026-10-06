"""Remove the runtime need for Wix hosts from the static pages (idempotent).
1. cm-wix-guard: pre-defines inert <wow-image>/<wix-video> custom elements so Wix's inline
   custom-element runtime (which skips already-defined names) cannot repoint the server-rendered
   local <img>/<video> at static.wixstatic.com / video.wixstatic.com. It also starts the locally
   vendored background videos (fix_videos.py --bg) and fades their poster once playing.
2. Vendors parastorage fonts/CSS/images referenced OUTSIDE <script> (inline <style> @font-face,
   <link rel=stylesheet|preload>; not <style data-url|data-href> labels, which Thunderbolt uses to dedupe CSS) into media/f/<sha12>.<ext>; url()s inside vendored CSS too.
   URLs inside <script> bodies (Thunderbolt JSON) are left untouched on purpose (403 lesson).
3. Wix server-renders every <wow-image> with a tiny blurred placeholder (isLQIP, blur_2 at ~half
   size) and relies on its runtime + static.wixstatic.com to swap in the real image. For each
   <wow-image> this fetches the real rendition once (2x the target box, capped at the original
   size / 2560px; originals for gif/svg) into media/i/<sha12>.<ext> and points the <img> at it.
Usage: python vendor_wix.py <appRoot> [<appRoot>...] [--no-download]
"""
import re, sys, os, glob, hashlib, subprocess, time, json, html as HTML, urllib.parse, concurrent.futures as cf
NODL = '--no-download' in sys.argv
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36'}
GUARD = ('<!-- cm-wix-guard:start --><script id="cm-wix-guard">(function(){var C=window.customElements;if(!C)return;'
         '["wow-image","wix-video"].forEach(function(n){if(!C.get(n))C.define(n,class extends HTMLElement{})})})();'
         'document.addEventListener("DOMContentLoaded",function(){var rm=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;'
         'document.querySelectorAll("wix-video video[data-cm-bg]").forEach(function(v){var p=v.parentNode.querySelector(".bgVideoposter");'
         'function h(){if(p)p.style.opacity="0"}if(rm){v.removeAttribute("autoplay");v.pause();return}'
         'v.addEventListener("playing",h);v.addEventListener("timeupdate",function t(){if(v.currentTime>0){h();v.removeEventListener("timeupdate",t)}});'
         'if(!v.paused&&v.readyState>2)h();v.muted=true;var r=v.play();if(r&&r.catch)r.catch(function(){})})});'
         '</script><!-- cm-wix-guard:end -->')
GUARD_RE = re.compile(r'<!-- cm-wix-guard:start -->.*?<!-- cm-wix-guard:end -->', re.S)
URL_RE = re.compile(r'(?<!data-url=")(?<!data-href=")(?:https:|(?<![:\w]))//(?:static|siteassets)\.parastorage\.com/[^"\'\s)<>]+?\.(?:woff2?|ttf|otf|eot|css|png|svg|gif|jpe?g)(?:\?[^"\'\s)<>]*)?(?=["\'\s)<>])', re.I)
_cache = {}

def local_name(url):
    path = urllib.parse.urlsplit(url).path
    ext = os.path.splitext(path)[1].lower() or '.bin'
    return 'media/f/' + hashlib.sha1(url.encode()).hexdigest()[:12] + ext

def fetch(url, root, log):
    rel = local_name(url)
    dst = os.path.join(root, rel)
    if (root, url) in _cache: return rel
    if not os.path.exists(dst) and not NODL:
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        data = None
        for attempt in range(4):
            r = subprocess.run(['curl', '-gsSfL', '--max-time', '60', '-A', UA['User-Agent'], url], capture_output=True)
            if r.returncode == 0 and r.stdout: data = r.stdout; break
            time.sleep(2)
        if data is None: raise SystemExit('download failed: ' + url + ' ' + r.stderr.decode()[:200])
        if rel.endswith('.css'):
            css = data.decode('utf-8', 'replace')
            def sub(m):
                u = urllib.parse.urljoin(url, m.group(2).strip())
                if u.startswith('data:') or not u.startswith('http'): return m.group(0)
                r2 = fetch(u, root, log)
                return 'url(' + m.group(1) + os.path.basename(r2) + m.group(1)   # same dir media/f/
            css = re.sub(r'url\(\s*(["\']?)([^"\')]+)\1', sub, css)
            data = css.encode()
        with open(dst, 'wb') as f: f.write(data)
        log.append((url, rel, len(data)))
    _cache[(root, url)] = rel
    return rel


AL = {'center': 'c', 'top': 't', 'bottom': 'b', 'left': 'l', 'right': 'r', 'top_left': 'tl',
      'top_right': 'tr', 'bottom_left': 'bl', 'bottom_right': 'br'}
SNIFF = [(b'\xff\xd8', '.jpg'), (b'\x89PNG', '.png'), (b'GIF8', '.gif'), (b'<svg', '.svg'), (b'<?xml', '.svg')]

def real_url(info):
    d = info.get('imageData') or {}
    uri = d.get('uri'); tw, th = info.get('targetWidth'), info.get('targetHeight')
    if not uri: return None
    ext = os.path.splitext(uri)[1].lower()
    if ext in ('.gif', '.svg') or not (tw and th):
        return 'https://static.wixstatic.com/media/' + uri
    crop = d.get('crop') or {}
    ow, oh = (crop.get('width'), crop.get('height')) if crop.get('width') else (d.get('width'), d.get('height'))
    sc = 2.0
    if ow and oh: sc = min(sc, ow / tw, oh / th)
    sc = min(sc, 2560 / tw)
    w, h = max(1, round(tw * sc)), max(1, round(th * sc))
    mode = 'fit' if info.get('displayMode') in ('fit', 'fitWidth', 'fitHeight', 'legacy_fit_width', 'legacy_fit_height') else 'fill'
    pre = 'crop/x_%d,y_%d,w_%d,h_%d/' % (crop.get('x', 0), crop.get('y', 0), crop['width'], crop['height']) if crop.get('width') else ''
    al = '' if mode == 'fit' else ',al_' + AL.get(info.get('alignType'), 'c')
    name = os.path.splitext(uri)[0] + ('.png' if ext == '.png' else '.jpg')
    return 'https://static.wixstatic.com/media/%s/v1/%s%s/w_%d,h_%d%s,q_90,usm_0.66_1.00_0.01,enc_auto/%s' % (
        uri, pre, mode, w, h, al, name)

_hi = {}
def fetch_hi(root, url):
    """Download once, name media/i/<sha12(url)><sniffed ext>; return rel path or None."""
    if (root, url) in _hi: return _hi[(root, url)]
    base = 'media/i/' + hashlib.sha1(url.encode()).hexdigest()[:12]
    for e in ('.jpg', '.png', '.gif', '.svg', '.webp', '.avif'):
        if os.path.exists(os.path.join(root, base + e)):
            _hi[(root, url)] = base + e; return base + e
    rel = None
    if not NODL:
        r = subprocess.run(['curl', '-gsSfL', '--max-time', '90', '-A', UA['User-Agent'],
                            '-H', 'Accept: image/png,image/jpeg,image/gif,image/svg+xml,*/*;q=0.5', url], capture_output=True)
        data = r.stdout if r.returncode == 0 else b''
        ext = next((e for sig, e in SNIFF if data[:5].startswith(sig) or data.lstrip()[:5].startswith(sig)), None)
        if data[8:12] == b'WEBP': ext = '.webp'
        if data[4:12] in (b'ftypavif', b'ftypavis'): ext = '.avif'
        if ext:
            rel = base + ext
            os.makedirs(os.path.join(root, 'media', 'i'), exist_ok=True)
            open(os.path.join(root, rel), 'wb').write(data)
        else:
            print('   hi-res failed', url[:140], r.stderr.decode()[:120])
    _hi[(root, url)] = rel
    return rel

WOW_RE = re.compile(r'(<wow-image\b[^>]*?data-image-info="([^"]+)"[^>]*>)(\s*<img\b[^>]*>)')

def upgrade_images(root, h, todo=None):
    """todo is a set to collect URLs (prefetch pass); otherwise rewrite using downloaded files."""
    def rep(m):
        try: info = json.loads(HTML.unescape(m.group(2)))
        except ValueError: return m.group(0)
        url = real_url(info)
        if not url: return m.group(0)
        if todo is not None: todo.add(url); return m.group(0)
        rel = fetch_hi(root, url)
        if not rel: return m.group(0)
        img = m.group(3)
        img = re.sub(r'\s(?:srcset|srcSet|sizes)="[^"]*"', '', img)
        img = re.sub(r'\ssrc="[^"]*"', ' src="%s"' % rel, img, count=1)
        if ' data-cm-hi=' not in img: img = img.replace('<img', '<img data-cm-hi="1"', 1)
        return m.group(1) + img
    return WOW_RE.sub(rep, h)

def process(root):
    log, changed = [], 0
    files = [f for f in sorted(glob.glob(os.path.join(root, '*.html')))]
    todo = set()
    for f in files:
        h = open(f, encoding='utf-8', newline='').read()
        if 'classic-error-pages-statics' not in h and ('wixDesktopViewport' in h or 'wixMobileViewport' in h):
            upgrade_images(root, h, todo)
    with cf.ThreadPoolExecutor(8) as ex: list(ex.map(lambda u: fetch_hi(root, u), sorted(todo)))
    print(root, 'hi-res renditions', len(todo), 'ok', sum(1 for u in todo if _hi.get((root, u))))
    for f in files:
        h = open(f, encoding='utf-8', newline='').read()
        if '<html' not in h[:3000].lower() or 'classic-error-pages-statics' in h or not ('wixDesktopViewport' in h or 'wixMobileViewport' in h): continue  # skip stubs + captured Wix error pages
        o = h
        h = GUARD_RE.sub('', h)
        if 'wow-image' in h or 'wix-video' in h:
            h = re.sub(r'(<head\b[^>]*>)', lambda m: m.group(1) + GUARD, h, count=1)
        parts = re.split(r'(<script\b[^>]*>.*?</script>)', h, flags=re.S)
        for i in range(0, len(parts), 2):            # even = outside script bodies
            parts[i] = URL_RE.sub(lambda m: fetch(('https:' + m.group(0) if m.group(0).startswith('//') else m.group(0)).replace('&amp;', '&'), root, log), parts[i])
        h = ''.join(parts)
        h = upgrade_images(root, h)
        if h != o:
            open(f, 'w', encoding='utf-8', newline='').write(h); changed += 1
    for u, r, n in log: print('  vendored', r, n, u[:110])
    print(root, 'pages changed', changed, 'files vendored', len(log))

if __name__ == '__main__':
    for r in [a for a in sys.argv[1:] if not a.startswith('--')]: process(r)
