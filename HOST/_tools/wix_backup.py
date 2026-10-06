"""Raw backup of everything a crawl can reach on the Wix origins (run on a machine that can reach them).
Usage: python wix_backup.py <outDir> [--sites cm,sc] [--no-media] [--local cm=<appRoot>,sc=<appRoot>]
(--local adds every page slug of the static copy, so pages missing from the Wix sitemaps are kept too)
Writes <outDir>/<site>/{robots.txt, sitemaps/, html/desktop/, html/mobile/, media/, video/, docs/, embeds/, manifest.json}
clubmadeira's own hostname now points at Amplify, so its Wix origin is reached with curl --resolve
to the Wix edge (cfd.wixdns.net 162.159.143.12).
"""
import os, re, sys, json, subprocess, hashlib, html as H, concurrent.futures as cf, urllib.parse as up
OUT = sys.argv[1]
SITES = {'cm': dict(host='www.clubmadeira.uk', resolve='162.159.143.12', files='www-clubmadeira-uk'),
         'sc': dict(host='www.thesmartcatalogue.com', resolve=None, files='www-thesmartcatalogue-com')}
if '--sites' in sys.argv: SITES = {k: v for k, v in SITES.items() if k in sys.argv[sys.argv.index('--sites') + 1].split(',')}
NOMEDIA = '--no-media' in sys.argv
LOCAL = dict(kv.split('=', 1) for kv in sys.argv[sys.argv.index('--local') + 1].split(',')) if '--local' in sys.argv else {}
FEAT_RE = re.compile(r'https://siteassets\.parastorage\.com/pages/pages/thunderbolt\?[^"\s<>]*module=thunderbolt-(?:features|platform)[^"\s<>]*')
DESK = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
MOB = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
CURL = 'curl.exe' if os.name == 'nt' else 'curl'

def curl(url, dst=None, ua=DESK, site=None):
    cmd = [CURL, '-gsSL', '--compressed', '--max-time', '300', '-A', ua, '-w', '%{http_code}']
    if site and site.get('resolve') and up.urlsplit(url).hostname == site['host']:
        cmd += ['--resolve', f"{site['host']}:443:{site['resolve']}"]
    if dst:
        os.makedirs(os.path.dirname(dst), exist_ok=True); cmd += ['-o', dst]
    for _ in range(3):
        r = subprocess.run(cmd + [url], capture_output=True)
        out = r.stdout
        code = out[-3:].decode(errors='replace') if len(out) >= 3 else '000'
        body = out[:-3]
        if code.startswith('2') or code in ('404', '410', '403'): break
    return code, body

def page_path(url):
    p = up.urlsplit(url).path.strip('/') or 'index'
    p = re.sub(r'[^\w./-]', '_', up.unquote(p))
    if len(p) > 100: p = p[:80] + '_' + hashlib.sha1(p.encode()).hexdigest()[:10]
    return p + '.html'

MEDIA_RE = re.compile(r'(?<![0-9a-zA-Z])((?:[0-9a-f]{6}_)?[0-9a-f]{32}(?:~mv2|_mv2)?(?:_d_\d+_\d+_s_\w+)?\.(?:jpe?g|png|gif|webp|avif|svg|bmp|tiff?|ico))', re.I)
STATIC_RE = re.compile(r'static\.wixstatic\.com/((?:shapes|ufonts|media)/[^"\'\s)\\<>&]+)')
VIDEO_RE = re.compile(r'video/([0-9a-f]{6}_[0-9a-f]{32})/(\d+)p/mp4/file\.mp4')
DOC_RE = re.compile(r'ugd/([0-9a-f]{6}_[0-9a-f]{32}\.\w{2,5})')
EMBED_RE = re.compile(r'filesusr\.com/html/([0-9a-f]{6}_[0-9a-f]{32}\.html)')

def main():
    for key, site in SITES.items():
        base = os.path.join(OUT, key); man = {'pages': {}, 'errors': []}
        host = site['host']
        c, b = curl(f'https://{host}/robots.txt', os.path.join(base, 'robots.txt'), site=site); man['robots'] = c
        # sitemaps, recursive
        todo, seen, pages, images = [f'https://{host}/sitemap.xml'], set(), [], set()
        while todo:
            u = todo.pop(0)
            if u in seen: continue
            seen.add(u)
            name = re.sub(r'[^\w.-]', '_', up.urlsplit(u).path.strip('/') + ('_' + up.urlsplit(u).query if up.urlsplit(u).query else ''))
            c, _ = curl(u, os.path.join(base, 'sitemaps', name), site=site)
            x = open(os.path.join(base, 'sitemaps', name), encoding='utf-8', errors='replace').read()
            locs = [H.unescape(l) for l in re.findall(r'<loc>\s*([^<]+?)\s*</loc>', x)]
            if '<sitemapindex' in x: todo += locs
            else: pages += locs
            images |= {H.unescape(i) for i in re.findall(r'<image:loc>\s*([^<]+?)\s*</image:loc>', x)}
            man.setdefault('sitemaps', {})[u] = [c, len(locs)]
        if key in LOCAL:
            import glob as G
            for f in sorted(G.glob(os.path.join(LOCAL[key], '*.html'))):
                b = os.path.basename(f)
                if b.endswith('.m.html'): continue
                t = open(f, encoding='utf-8', errors='ignore').read(400000)
                if 'wixDesktopViewport' not in t or 'classic-error-pages' in t: continue
                pages.append(f'https://{host}/' + ('' if b == 'index.html' else b[:-5]))
        pages = list(dict.fromkeys(pages))
        print(key, 'sitemaps', len(seen), 'pages', len(pages), 'sitemap images', len(images), flush=True)
        blobs = []
        def grab(u):
            res = {}
            for kind, ua in (('desktop', DESK), ('mobile', MOB)):
                dst = os.path.join(base, 'html', kind, page_path(u))
                c, _ = curl(u, dst, ua=ua, site=site); res[kind] = c
                try: blobs.append(open(dst, encoding='utf-8', errors='replace').read())
                except OSError: pass
            # component/data JSON Thunderbolt would load for this page (holds dynamic-page data)
            try: t = open(os.path.join(base, 'html', 'desktop', page_path(u)), encoding='utf-8', errors='replace').read()
            except OSError: t = ''
            for i, fu in enumerate(sorted(set(H.unescape(x) for x in FEAT_RE.findall(t)))):
                mod = re.search(r'module=thunderbolt-(\w+)', fu).group(1)
                dst = os.path.join(base, 'json', page_path(u)[:-5] + f'.{mod}{i}.json')
                c, _ = curl(fu, dst); res['json_' + mod + str(i)] = c
                try: blobs.append(open(dst, encoding='utf-8', errors='replace').read())
                except OSError: pass
            return u, res
        with cf.ThreadPoolExecutor(8) as ex:
            for u, res in ex.map(grab, pages): man['pages'][u] = res
        # include the HTTrack/static copies too, so media referenced only there is kept
        allt = up.unquote('\n'.join(blobs) + '\n' + '\n'.join(images)).replace('\\/', '/')
        media = set(MEDIA_RE.findall(allt)) | set(re.findall(r'wix:image://v1/([^/"\\]+)/', allt))
        media = {m.replace('_mv2', '~mv2') for m in media}
        statics = {s for s in STATIC_RE.findall(allt) if not s.startswith('media/')}
        for i in images:
            m = re.search(r'static\.wixstatic\.com/media/([^/?#]+)', i)
            if m: media.add(up.unquote(m.group(1)))
        vids = {}
        for vid, q in VIDEO_RE.findall(allt): vids[vid] = max(vids.get(vid, 0), int(q))
        docs, embeds = set(DOC_RE.findall(allt)), set(EMBED_RE.findall(allt))
        man['counts'] = dict(media=len(media), statics=len(statics), videos=len(vids), docs=len(docs), embeds=len(embeds))
        print(key, man['counts'], flush=True)
        jobs = []
        if not NOMEDIA:
            jobs += [(f'https://static.wixstatic.com/media/{m}', os.path.join(base, 'media', m.replace('~', '_'))) for m in media]
            jobs += [(f'https://static.wixstatic.com/{s}', os.path.join(base, 'static', *s.split('/'))) for s in statics]
            for vid, q in vids.items():
                for qq in (q, 1080, 720, 480, 360):
                    if qq <= q: jobs.append((f'https://video.wixstatic.com/video/{vid}/{qq}p/mp4/file.mp4', os.path.join(base, 'video', f'{vid}-{qq}p.mp4'))); break
            jobs += [(f"https://{site['files']}.filesusr.com/ugd/{d}", os.path.join(base, 'docs', d)) for d in docs]
            jobs += [(f"https://{site['files']}.filesusr.com/html/{e}", os.path.join(base, 'embeds', e)) for e in embeds]
        def dl(j):
            u, d = j
            if os.path.exists(d) and os.path.getsize(d) > 0: return u, 'cached'
            c, _ = curl(u, d)
            if not c.startswith('2'):
                try: os.remove(d)
                except OSError: pass
            return u, c
        with cf.ThreadPoolExecutor(8) as ex:
            res = dict(ex.map(dl, jobs))
        man['assets'] = res
        bad = {u: c for u, c in res.items() if c not in ('cached',) and not c.startswith('2')}
        man['asset_failures'] = bad
        print(key, 'assets', len(res), 'failed', len(bad), flush=True)
        json.dump(man, open(os.path.join(base, 'manifest.json'), 'w'), indent=1)

if __name__ == '__main__':
    main()
