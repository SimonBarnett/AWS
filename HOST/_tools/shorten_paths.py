"""Flatten long asset paths in the Amplify Wix exports (no core.longpaths needed).

1. Every file under <appRoot>/static.wixstatic.com/media/** moves to media/i/<hash12><ext>
   (see wixmedia.py); every reference in *.html / *.css / *.json under the appRoot is
   rewritten (attribute values incl. srcset with raw commas/spaces, style url(),
   relative or absolute https://static.wixstatic.com/media refs outside <script>).
   Referenced media that is missing locally is fetched from static.wixstatic.com.
2. Unreferenced Thunderbolt CSS fallbacks under
   static.parastorage.com/services/editor-elements-library/dist/thunderbolt/ move to
   static.parastorage.com/tb/ (HTML loads Thunderbolt from https://static.parastorage.com).
Idempotent. Usage: python shorten_paths.py [cm|sc ...]
"""
import os, re, sys, shutil
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wixmedia as W

HOST_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOTS = {'cm': os.path.join(HOST_DIR, 'clubmadeira', 'www.clubmadeira.uk'),
         'sc': os.path.join(HOST_DIR, 'smartcatalogue', 'www.thesmartcatalogue.com')}
TB_OLD = 'static.parastorage.com/services/editor-elements-library/dist/thunderbolt'
TB_NEW = 'static.parastorage.com/tb'

def move_media(root):
    base = os.path.join(root, 'static.wixstatic.com', 'media')
    moved = 0
    if not os.path.isdir(base): return moved
    for dp, dn, fn in os.walk(base, topdown=False):
        for f in fn:
            src = os.path.join(dp, f)
            rel = os.path.relpath(src, root).replace('\\', '/')
            key = W.key_of(rel)
            dst = os.path.join(root, *W.short_of(key).split('/'))
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            if os.path.exists(dst): os.remove(src)
            else: shutil.move(src, dst)
            moved += 1
        if not os.listdir(dp): os.rmdir(dp)
    sw = os.path.join(root, 'static.wixstatic.com')
    if os.path.isdir(sw) and not os.listdir(sw): os.rmdir(sw)
    return moved

def move_tb(root):
    old = os.path.join(root, *TB_OLD.split('/'))
    if not os.path.isdir(old): return 0
    new = os.path.join(root, *TB_NEW.split('/')); os.makedirs(new, exist_ok=True)
    n = 0
    for f in os.listdir(old):
        shutil.move(os.path.join(old, f), os.path.join(new, f)); n += 1
    d = old
    while d != root and os.path.isdir(d) and not os.listdir(d):
        os.rmdir(d); d = os.path.dirname(d)
    return n

MEDIA_START = re.compile(r'(?:https?:)?(?://)?static\.wixstatic\.com/media/', re.I)
def map_url(root, url, stats):
    u = url.strip()
    if not MEDIA_START.match(re.sub(r'^(?:\./|/)+', '', u)): return url
    key = W.key_of(u)
    if not key: return url
    for k in W.variants(key):
        short = W.short_of(k)
        if os.path.exists(os.path.join(root, *short.split('/'))):
            stats['mapped'] += 1; return short
    short = W.localize(root, u, stats['fail'])
    if short: stats['downloaded'] += 1; return short
    return url

SRCSET_CAND = re.compile(r'\s*(.+?)(\s+\d+(?:\.\d+)?[wx])\s*(?:,|$)')
def map_srcset(root, v, stats):
    if 'wixstatic.com/media/' not in v: return v
    cands = SRCSET_CAND.findall(v)
    if not cands or ''.join(c[0] + c[1] for c in cands).replace(' ', '') != re.sub(r'[\s,]', '', v).replace(',', '') and False:
        return map_url(root, v, stats)
    if not cands: return map_url(root, v, stats)
    return ', '.join(map_url(root, u, stats) + d for u, d in cands)

URLFN = re.compile(r'url\((\s*(?:&quot;|["\'])?)([^"\')&]+?)((?:&quot;|["\'])?\s*)\)')
ATTR = re.compile(r'(\s(?:src|href|poster|data-src|data-srcset|srcset|content|data-bg|style)=)"([^"]*)"', re.I)
ABS_IN_TEXT = re.compile(r'(?:https?:)?//static\.wixstatic\.com/media/[^"\'\s()<>&\\]+')

def rewrite_text(root, h, stats, is_html):
    def fix_part(part):
        def attr(m):
            name = m.group(1).strip().lower().rstrip('=')
            v = m.group(2)
            if 'wixstatic.com/media/' not in v: return m.group(0)
            if name in ('srcset', 'data-srcset'): nv = map_srcset(root, v, stats)
            elif name == 'style': nv = URLFN.sub(lambda u: 'url(' + u.group(1) + map_url(root, u.group(2), stats) + u.group(3) + ')', v)
            elif name == 'content' and not v.lstrip().startswith(('static.wixstatic', './static.wixstatic')): nv = v  # keep og:image etc. absolute
            else: nv = map_url(root, v, stats)
            return m.group(1) + '"' + nv + '"'
        part = ATTR.sub(attr, part)
        part = URLFN.sub(lambda u: 'url(' + u.group(1) + map_url(root, u.group(2), stats) + u.group(3) + ')'
                         if 'wixstatic.com/media/' in u.group(2) else u.group(0), part)
        return part
    if not is_html: return URLFN.sub(lambda u: 'url(' + u.group(1) + map_url(root, u.group(2), stats) + u.group(3) + ')'
                                     if 'wixstatic.com/media/' in u.group(2) else u.group(0), h)
    parts = re.split(r'(<script\b[^>]*>.*?</script>)', h, flags=re.S | re.I)
    return ''.join(p if i % 2 else fix_part(p) for i, p in enumerate(parts))

def rewrite_refs(root):
    stats = dict(mapped=0, downloaded=0, fail=[], files=0)
    for dp, dn, fn in os.walk(root):
        for f in fn:
            if not f.endswith(('.html', '.css', '.json')): continue
            p = os.path.join(dp, f)
            with open(p, encoding='utf-8', newline='', errors='surrogateescape') as fh: h = fh.read()
            if 'wixstatic.com/media/' not in h: continue
            nh = rewrite_text(root, h, stats, f.endswith('.html'))  # tb/ files are unreferenced: HTML keeps https://static.parastorage.com
            if nh != h:
                with open(p, 'w', encoding='utf-8', newline='', errors='surrogateescape') as fh: fh.write(nh)
                stats['files'] += 1
    return stats

def main():
    keys = [a for a in sys.argv[1:] if a in ROOTS] or list(ROOTS)
    for k in keys:
        root = ROOTS[k]
        m = move_media(root); t = move_tb(root)
        s = rewrite_refs(root)
        print('== %s moved media=%d tb=%d | refs mapped=%d downloaded=%d files=%d failures=%d' % (
            k, m, t, s['mapped'], s['downloaded'], s['files'], len(s['fail'])))
        for u, e in s['fail']: print('  FAIL', u[:160], e)

if __name__ == '__main__':
    main()
