"""Fix internal links in the Amplify Wix exports (desktop *.html and mobile *.m.html).

* Wix document links (https://<site>/_files/ugd/<f>, https://<site-slug>.filesusr.com/ugd/<f>
  and the mangled https://<uuid>.https://filesusr.com/ugd/<f> left by an earlier rewrite)
  -> local _files/ugd/<f> (downloaded once from the Wix file host).
* <a>/<area> hrefs to absolute own-host pages (https://www.clubmadeira.uk/<slug>,
  https://www.thesmartcatalogue.com/<slug>, ...) -> <slug>.html on desktop pages,
  <slug>.m.html on mobile pages (falls back to the desktop copy).
rel=canonical / rel=alternate stay absolute. Idempotent.
Usage: python fix_links.py [cm|sc ...]
"""
import html as H, os, re, sys, urllib.parse, urllib.request

HOST_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITES = {
    'cm': dict(root=os.path.join(HOST_DIR, 'clubmadeira', 'www.clubmadeira.uk'),
               hosts=['www.clubmadeira.uk', 'clubmadeira.uk'], files='https://www-clubmadeira-uk.filesusr.com/ugd/'),
    'sc': dict(root=os.path.join(HOST_DIR, 'smartcatalogue', 'www.thesmartcatalogue.com'),
               hosts=['www.thesmartcatalogue.com', 'thesmartcatalogue.com', 'www.smartcatalogue.uk', 'smartcatalogue.uk'],
               files='https://www-thesmartcatalogue-com.filesusr.com/ugd/'),
}
# Pages Wix serves as 301 redirects (still listed in the Wix sitemap): stub page + links retargeted
REDIRECTS = {'cm': {'stripe': 'store-releases'}, 'sc': {}}
STUB = ('<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Redirecting…</title>'
        '<link rel="canonical" href="{live}/{tgt}"><meta name="robots" content="noindex">'
        '<meta http-equiv="refresh" content="0; url={tgt}.html">'
        '<script>location.replace("/{tgt}.html"+location.search+location.hash)</script></head>'
        '<body><p>This page has moved to <a href="{tgt}.html">{tgt}</a>.</p></body></html>\n')
LIVE = {'cm': 'https://www.clubmadeira.uk', 'sc': 'https://www.smartcatalogue.uk'}
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36'

def fix_site(key):
    s = SITES[key]; root = s['root']
    for src, tgt in REDIRECTS[key].items():
        stub = os.path.join(root, src + '.html')
        body = STUB.format(live=LIVE[key], tgt=tgt)
        if not os.path.exists(stub) or open(stub, encoding='utf-8').read() != body:
            with open(stub, 'w', encoding='utf-8', newline='') as fh: fh.write(body)
            print('   redirect stub', src + '.html', '->', tgt)
    pages = {f[:-5] for f in os.listdir(root) if f.endswith('.html') and not f.endswith('.m.html')}
    mobile = {f[:-7] for f in os.listdir(root) if f.endswith('.m.html')}
    hosts = '|'.join(re.escape(h) for h in s['hosts'])
    doc_rx = re.compile(r'https?://(?:[0-9a-f-]{36}\.https://filesusr\.com|[\w-]+\.filesusr\.com|(?:%s)/_files)/ugd/([\w.-]+)' % hosts)
    a_rx = re.compile(r'(<a(?:rea)?\b[^>]*?\shref=")https?://(?:%s)(/[^"#?]*)?([?#][^"]*)?"' % hosts)
    stats = dict(docs=0, links=0, files=0)
    def doc(m):
        f = m.group(1); dest = os.path.join(root, '_files', 'ugd', f)
        if not os.path.exists(dest):
            data = urllib.request.urlopen(urllib.request.Request(s['files'] + f, headers={'User-Agent': UA}), timeout=60).read()
            os.makedirs(os.path.dirname(dest), exist_ok=True); open(dest, 'wb').write(data)
            print('   doc +', f, len(data))
        stats['docs'] += 1
        return '_files/ugd/' + f
    for f in sorted(os.listdir(root)):
        if not f.endswith('.html'): continue
        is_m = f.endswith('.m.html')
        p = os.path.join(root, f)
        with open(p, encoding='utf-8', newline='') as fh: h = fh.read()
        o = h
        h = doc_rx.sub(doc, h) if ('ugd/' in h) else h
        def link(m):
            slug = urllib.parse.unquote((m.group(2) or '/').strip('/')) or 'index'
            slug = REDIRECTS[key].get(slug, slug)
            tail = m.group(3) or ''
            if is_m and slug in mobile: tgt = slug + '.m.html'
            elif slug in pages: tgt = slug + '.html'
            else: return m.group(0)
            stats['links'] += 1
            return m.group(1) + tgt + tail + '"'
        h = a_rx.sub(link, h)
        for src, tgt in REDIRECTS[key].items():
            t = tgt + ('.m.html' if is_m and tgt in mobile else '.html')
            h = re.sub(r'(<a(?:rea)?\b[^>]*?\shref=")%s(?:\.m)?(?:\.html)?([?#][^"]*)?"' % re.escape(src),
                       lambda m: m.group(1) + t + (m.group(2) or '') + '"', h)
        if h != o:
            with open(p, 'w', encoding='utf-8', newline='') as fh: fh.write(h)
            stats['files'] += 1
    print('== %s docs=%d links=%d files=%d' % (key, stats['docs'], stats['links'], stats['files']))

if __name__ == '__main__':
    for k in [a for a in sys.argv[1:] if a in SITES] or list(SITES): fix_site(k)
