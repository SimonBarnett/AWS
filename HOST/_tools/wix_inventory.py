"""Inventory remaining references to Wix-owned hosts in the Amplify appRoots.

Groups by host and by context: 'attr' (HTML attributes / CSS outside <script>, i.e. loaded
by the browser without Wix JS) vs 'script' (inside <script> bodies / JSON, only used if Wix
JS runs) vs 'css'/'js'/'json' files. Classifies hosts as site-owned content vs Wix platform.
Usage: python wix_inventory.py [--detail host-substring] [--json out.json]
"""
import json, os, re, sys, collections

HOST_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOTS = {'cm': os.path.join(HOST_DIR, 'clubmadeira', 'www.clubmadeira.uk'),
         'sc': os.path.join(HOST_DIR, 'smartcatalogue', 'www.thesmartcatalogue.com')}
HOST_RE = re.compile(r'(?:https?:)?(?:\\?/\\?/)((?:[a-z0-9-]+\.)*(?:wixstatic\.com|parastorage\.com|filesusr\.com|wix\.com|wixpress\.com|'
                     r'wixsite\.com|usrfiles\.com|wixmp\.com|wix-code\.com|wixapps\.net|wixdns\.net|editorx\.io))', re.I)
SITE_OWNED = ('static.wixstatic.com', 'video.wixstatic.com', 'filesusr.com', 'usrfiles.com', 'wixmp.com', 'wixsite.com')
def kind(host):
    h = host.lower()
    if any(h == s or h.endswith('.' + s) or h.endswith(s) for s in SITE_OWNED): return 'site-owned'
    return 'platform'

def scan():
    res = collections.defaultdict(lambda: collections.Counter())
    files = collections.defaultdict(set)
    samples = collections.defaultdict(list)
    for key, root in ROOTS.items():
        for dp, dn, fn in os.walk(root):
            for f in fn:
                ext = f.rsplit('.', 1)[-1].lower()
                if ext not in ('html', 'css', 'js', 'json', 'xml', 'svg', 'txt'): continue
                p = os.path.join(dp, f); rel = os.path.relpath(p, root).replace('\\', '/')
                t = open(p, encoding='utf-8', errors='replace').read()
                if ext == 'html':
                    parts = re.split(r'(<script\b[^>]*>.*?</script>)', t, flags=re.S | re.I)
                    for i, part in enumerate(parts):
                        ctx = 'script' if i % 2 else 'attr'
                        if ctx == 'script':
                            m = re.match(r'<script\b([^>]*)>', part)
                            src = re.search(r'\ssrc="([^"]+)"', m.group(1)) if m else None
                            if src:  # external <script src=...> is loaded by the browser
                                for hm in HOST_RE.finditer(src.group(1)):
                                    res[(key, hm.group(1).lower(), 'script-src')][rel] += 1; files[(key, hm.group(1).lower(), 'script-src')].add(rel)
                        for hm in HOST_RE.finditer(part):
                            k = (key, hm.group(1).lower(), ctx)
                            res[k][rel] += 1; files[k].add(rel)
                            if len(samples[k]) < 3: samples[k].append(part[max(0, hm.start()-60):hm.end()+90].replace('\n', ' '))
                else:
                    for hm in HOST_RE.finditer(t):
                        k = (key, hm.group(1).lower(), ext)
                        res[k][rel] += 1; files[k].add(rel)
                        if len(samples[k]) < 3: samples[k].append(t[max(0, hm.start()-60):hm.end()+90].replace('\n', ' '))
    return res, files, samples

def main():
    res, files, samples = scan()
    det = sys.argv[sys.argv.index('--detail') + 1] if '--detail' in sys.argv else None
    rows = sorted(res.items(), key=lambda kv: (kv[0][0], kind(kv[0][1]), kv[0][1], kv[0][2]))
    out = []
    print('%-3s %-10s %-42s %-10s %7s %6s' % ('app', 'class', 'host', 'context', 'refs', 'files'))
    for (key, host, ctx), c in rows:
        out.append(dict(app=key, host=host, cls=kind(host), ctx=ctx, refs=sum(c.values()), files=len(c)))
        print('%-3s %-10s %-42s %-10s %7d %6d' % (key, kind(host), host, ctx, sum(c.values()), len(c)))
        if det and det in host:
            for s in samples[(key, host, ctx)]: print('      ', s[:220])
    if '--json' in sys.argv: json.dump(out, open(sys.argv[sys.argv.index('--json') + 1], 'w'), indent=1)

if __name__ == '__main__':
    main()
