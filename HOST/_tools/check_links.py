"""Link and asset checker for the Amplify static Wix exports (desktop + mobile).

Local mode resolves every internal reference against the appRoot the way Amplify
serves it (file, <path>.html, <dir>/index.html); live mode fetches the same internal
URLs from the custom domain. Covers <a>/<area> href, <link> href, <script> src,
img/source src+srcset, video/audio src+poster, iframe src, object/embed, inline
style url(), <style> url() and url() inside local CSS files. Refs inside <script>
bodies (Wix JSON) are not checked.

Usage: python check_links.py [cm|sc ...] [--live] [--external] [--json out.json]
"""
import concurrent.futures as cf, html.parser, json, os, re, sys, urllib.parse, urllib.request, ssl

TOOLS = os.path.dirname(os.path.abspath(__file__))
HOST_DIR = os.path.dirname(TOOLS)
SITES = {
    'cm': dict(root=os.path.join(HOST_DIR, 'clubmadeira', 'www.clubmadeira.uk'), live='https://www.clubmadeira.uk',
               own={'www.clubmadeira.uk', 'clubmadeira.uk'}),
    'sc': dict(root=os.path.join(HOST_DIR, 'smartcatalogue', 'www.thesmartcatalogue.com'), live='https://www.smartcatalogue.uk',
               own={'www.thesmartcatalogue.com', 'thesmartcatalogue.com', 'www.smartcatalogue.uk', 'smartcatalogue.uk'}),
}
SKIP_SCHEMES = ('mailto:', 'tel:', 'javascript:', 'data:', 'blob:', 'about:', 'sms:', 'whatsapp:')
URL_RE = re.compile(r'url\(\s*(?:&quot;|["\'])?([^"\')]+?)(?:&quot;|["\'])?\s*\)')
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36'

def parse_srcset(v):
    """HTML spec-ish srcset parsing. Returns (urls, dropped) like a browser."""
    out, bad, i, n = [], [], 0, len(v)
    while i < n:
        while i < n and (v[i].isspace() or v[i] == ','): i += 1
        if i >= n: break
        j = i
        while j < n and not v[j].isspace(): j += 1
        url = v[i:j]; i = j
        if url.endswith(','):
            out.append(url.rstrip(',')); continue
        k = v.find(',', i); desc = (v[i:] if k < 0 else v[i:k]).split(); i = n if k < 0 else k + 1
        if all(re.fullmatch(r'\d+(\.\d+)?[wx]|\d+h', d) for d in desc) and len(desc) <= 2: out.append(url)
        else: bad.append(url + ' ' + ' '.join(desc))
    return out, bad

class P(html.parser.HTMLParser):
    def __init__(s):
        super().__init__(convert_charrefs=True); s.refs = []; s.in_style = False; s.in_script = False
    def add(s, kind, tag, v):
        if v is not None and v.strip(): s.refs.append((kind, tag, v.strip()))
    def handle_starttag(s, tag, attrs):
        a = dict(attrs)
        if tag == 'script':
            s.in_script = True; s.add('script', tag, a.get('src')); return
        if tag == 'style': s.in_style = True
        if tag in ('a', 'area'): s.add('link', tag, a.get('href'))
        if tag == 'link': s.add('asset' if (a.get('rel') or '') not in ('canonical', 'alternate') else 'link', 'link[%s]' % a.get('rel'), a.get('href'))
        if tag in ('img', 'source', 'video', 'audio', 'track', 'embed', 'input'):
            s.add('asset', tag, a.get('src'))
        if tag in ('img', 'source') and a.get('srcset'):
            ok, bad = parse_srcset(a['srcset'])
            for u in ok: s.add('asset', tag + '[srcset]', u)
            for b in bad: s.refs.append(('badsrcset', tag, b))
        if tag == 'video': s.add('asset', 'video[poster]', a.get('poster'))
        if tag == 'iframe': s.add('frame', tag, a.get('src'))
        if tag == 'object': s.add('asset', tag, a.get('data'))
        if a.get('style'):
            for u in URL_RE.findall(a['style']): s.add('asset', 'style', u)
    def handle_endtag(s, tag):
        if tag == 'style': s.in_style = False
        if tag == 'script': s.in_script = False
    def handle_data(s, d):
        if s.in_style:
            for u in URL_RE.findall(d): s.add('asset', 'style', u)

def resolve_local(root, page_rel, url):
    u = urllib.parse.urlsplit(url)
    path = urllib.parse.unquote(u.path)
    if not path: return True, page_rel
    base = '/' + os.path.dirname(page_rel).replace('\\', '/')
    full = path if path.startswith('/') else urllib.parse.urljoin(base.rstrip('/') + '/', path)
    full = os.path.normpath(full).replace('\\', '/')
    rel = full.lstrip('/')
    cands = [(rel + '/index.html').lstrip('/'), 'index.html'] if (path.endswith('/') or rel in ('', '.')) else [rel, rel + '.html', rel + '/index.html']
    for c in cands:
        p = os.path.join(root, *c.split('/')) if c else root
        if os.path.isfile(p): return True, c
    return False, rel

def classify(site, url):
    if url.startswith('#') or url.lower().startswith(SKIP_SCHEMES): return 'skip', None
    if url.startswith('//'): url = 'https:' + url
    u = urllib.parse.urlsplit(url)
    if u.scheme in ('http', 'https'):
        return ('internal', u._replace(scheme='', netloc='').geturl() or '/') if u.netloc.lower() in site['own'] else ('external', url)
    if u.scheme: return 'skip', None
    return 'internal', url

def pages_of(root):
    return sorted(f for f in os.listdir(root) if f.endswith('.html'))

def css_refs(root, rel):
    try: t = open(os.path.join(root, *rel.split('/')), encoding='utf-8', errors='replace').read()
    except Exception: return []
    return [('asset', 'css', u) for u in URL_RE.findall(t)]

def fetch_status(url, method='HEAD'):
    ctx = ssl.create_default_context()
    try:
        r = urllib.request.urlopen(urllib.request.Request(url, method=method, headers={'User-Agent': UA, 'Accept': '*/*'}), timeout=25, context=ctx)
        return r.status, r.headers.get('Content-Type', '')
    except urllib.error.HTTPError as e:
        if method == 'HEAD' and e.code in (403, 405, 400, 501): return fetch_status(url, 'GET')
        return e.code, e.headers.get('Content-Type', '') if e.headers else ''
    except Exception as e:
        if method == 'HEAD': return fetch_status(url, 'GET')
        return 'ERR ' + type(e).__name__, ''

def main():
    keys = [a for a in sys.argv[1:] if a in SITES] or list(SITES)
    live, ext = '--live' in sys.argv, '--external' in sys.argv
    report = {}
    for key in keys:
        site = SITES[key]; root = site['root']
        broken, badsrc, externals, n_int, seen_css = [], [], {}, 0, set()
        live_urls = {}
        for page in pages_of(root):
            p = P(); p.feed(open(os.path.join(root, page), encoding='utf-8', errors='replace').read())
            refs = list(p.refs)
            for kind, tag, url in refs:
                if kind == 'badsrcset': badsrc.append((page, url[:160])); continue
                cls, norm = classify(site, url)
                if cls == 'skip': continue
                if cls == 'external':
                    externals.setdefault(norm.split('#')[0], set()).add(page); continue
                n_int += 1
                ok, rel = resolve_local(root, page, norm)
                if not ok: broken.append((page, tag, url[:200]))
                else:
                    live_urls.setdefault(rel, (page, tag, url))
                    if rel.endswith('.css') and rel not in seen_css:
                        seen_css.add(rel)
                        for _, t2, u2 in css_refs(root, rel):
                            c2, n2 = classify(site, u2)
                            if c2 != 'internal': continue
                            ok2, r2 = resolve_local(root, rel, n2)
                            if not ok2: broken.append((rel, 'css', u2[:200]))
        res = dict(pages=len(pages_of(root)), internal_refs=n_int, unique_internal_targets=len(live_urls),
                   broken=broken, bad_srcset=badsrc, external_unique=len(externals))
        if live:
            def chk(rel):
                st, ct = fetch_status(site['live'] + '/' + urllib.parse.quote(rel, safe='/._-~'), 'GET' if rel.endswith('.html') else 'HEAD')
                return rel, st, ct
            bad_live = []
            with cf.ThreadPoolExecutor(16) as ex:
                for rel, st, ct in ex.map(chk, live_urls):
                    is_html = rel.endswith('.html') or rel in ('', 'index.html')
                    if st != 200 or (not is_html and 'text/html' in ct):
                        bad_live.append((rel, st, ct, live_urls[rel][0]))
            res['live_checked'] = len(live_urls); res['live_broken'] = bad_live
        if ext:
            dead = []
            with cf.ThreadPoolExecutor(16) as ex:
                for (u, pg), (st, ct) in zip(externals.items(), ex.map(fetch_status, externals)):
                    if not (isinstance(st, int) and st < 400): dead.append((u, st, sorted(pg)[:3]))
            res['external_dead'] = dead
        report[key] = res
        print('== %s pages=%d internal_refs=%d unique_targets=%d broken=%d bad_srcset=%d externals=%d%s%s' % (
            key, res['pages'], n_int, len(live_urls), len(broken), len(badsrc), len(externals),
            (' live_broken=%d/%d' % (len(res['live_broken']), res['live_checked'])) if live else '',
            (' external_dead=%d' % len(res['external_dead'])) if ext else ''))
        for b in broken[:400]: print('  BROKEN', *b)
        for b in badsrc[:50]: print('  BADSRCSET', *b)
        for b in res.get('live_broken', [])[:200]: print('  LIVE', *b)
        for b in res.get('external_dead', []): print('  EXTDEAD', *b)
    if '--json' in sys.argv:
        json.dump(report, open(sys.argv[sys.argv.index('--json') + 1], 'w'), indent=1, default=list)

if __name__ == '__main__':
    main()
