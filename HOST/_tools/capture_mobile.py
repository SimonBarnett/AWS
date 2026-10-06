"""Capture Wix *mobile* layouts for the Amplify static exports and wire them in.

For every real desktop page <slug>.html in an appRoot, fetch the same URL from the
live Wix origin with an iPhone User-Agent (Wix serves mobile markup by UA), save it as
<slug>.m.html next to the desktop page, then post-process it like the desktop export:
  * static.wixstatic.com media/ufonts -> local relative paths (downloaded if missing)
  * static.parastorage.com stays absolute (Thunderbolt CDN)
  * internal links -> <slug>.m.html (mobile copies) / <slug>.html (desktop-only pages)
  * S3 network-widget HtmlComponent embeds (html_embeds_map.json, same comp ids)
  * mobile hamburger menu (MENU_AS_CONTAINER) opens/closes without Wix JS
  * device redirect: desktop page -> mobile copy on phones, mobile copy -> desktop on
    non-phones (same test both ways => no loop; ?view=desktop|mobile overrides per session)
  * rel=canonical (mobile -> desktop URL) and rel=alternate (desktop -> mobile URL)
Afterwards run fix_videos.py on the appRoot for VideoPlayer embeds.

Idempotent. Usage (from repo root):
  python HOST/_tools/capture_mobile.py [cm|sc ...] [--no-fetch] [--no-media]
"""
import html as htmlmod, json, os, re, subprocess, sys, urllib.parse, urllib.request, shutil
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wixmedia as W

TOOLS = os.path.dirname(os.path.abspath(__file__))
HOST_DIR = os.path.dirname(TOOLS)
UA = ('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 '
      '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')
WIX_EDGE = '162.159.143.12'  # cfd.wixdns.net (Wix edge); custom domain DNS now points at Amplify
SITES = {
    'cm': dict(root=os.path.join(HOST_DIR, 'clubmadeira', 'www.clubmadeira.uk'),
               origin='www.clubmadeira.uk', resolve=True,
               hosts=['www.clubmadeira.uk', 'clubmadeira.uk'], live='https://www.clubmadeira.uk'),
    'sc': dict(root=os.path.join(HOST_DIR, 'smartcatalogue', 'www.thesmartcatalogue.com'),
               origin='www.thesmartcatalogue.com', resolve=False,
               hosts=['www.thesmartcatalogue.com', 'thesmartcatalogue.com', 'www.smartcatalogue.uk', 'smartcatalogue.uk'],
               live='https://www.smartcatalogue.uk'),
}
NOT_PAGES = {'api', 'bookings-checkout', 'envelope', 'event-details', 'event-details-registration',
             'feed', 'file.mp4', 'service-page', 'stores', 'events'}
# Sitemap entries deliberately not captured (reason shown in the log)
SKIP_SITEMAP = {
    'cm': {'stripe': 'Wix answers 301 -> /store-releases; fix_links.py writes a stripe.html redirect stub'},
    'sc': {},
}
NO_FETCH = '--no-fetch' in sys.argv
ADD_MISSING = '--add-missing' in sys.argv
NO_MEDIA = '--no-media' in sys.argv
MARK = ('<!-- cm-mobile:start -->', '<!-- cm-mobile:end -->')

def lp(p):  # long-path safe on Windows
    p = os.path.abspath(p)
    return '\\\\?\\' + p if os.name == 'nt' and not p.startswith('\\\\?\\') else p

def read(p):
    with open(lp(p), encoding='utf-8', newline='') as f: return f.read()

def write(p, s):
    with open(lp(p), 'w', encoding='utf-8', newline='') as f: f.write(s)

DESKTOP_UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) '
              'Chrome/129.0 Safari/537.36')

def fetch_page(site, slug, ua=UA):
    url = 'https://%s/%s' % (site['origin'], '' if slug == 'index' else slug)
    cmd = ['curl.exe' if os.name == 'nt' else 'curl', '-s', '--compressed', '-A', ua,
           '-H', 'Accept: text/html,application/xhtml+xml', '-H', 'Accept-Language: en-GB,en;q=0.9',
           '-w', '\n<!--cm-http:%{http_code}-->', url]
    if site['resolve']:
        cmd[1:1] = ['--resolve', '%s:443:%s' % (site['origin'], WIX_EDGE)]
    out = subprocess.run(cmd, capture_output=True, timeout=120).stdout.decode('utf-8', 'replace')
    m = re.search(r'\n<!--cm-http:(\d+)-->$', out)
    code = m.group(1) if m else '?'
    body = out[:m.start()] if m else out
    return code, body

def desktop_pages(root):
    pages = []
    for f in sorted(os.listdir(root)):
        if f.endswith('.html') and not f.endswith('.m.html'):
            slug = f[:-5]
            if slug in NOT_PAGES: continue
            if 'wixDesktopViewport' in read(os.path.join(root, f)): pages.append(slug)
    return pages

# ---------- media ----------
MEDIA_RE = re.compile(r'https://static\.wixstatic\.com/(?:media|ufonts)/[^"\'\s()<>&\\]+')
_dl_fail = []
def localize(root, url):
    if '/media/' in url[:40]:  # Wix media -> media/i/<hash12><ext> (short, deterministic; see wixmedia.py)
        if NO_MEDIA: return url
        short = W.localize(root, url, _dl_fail)
        return short or url
    path = urllib.parse.unquote(urllib.parse.urlparse(url).path)   # ufonts: short already
    disk_rel = 'static.wixstatic.com' + path.replace('~', '_')
    disk = os.path.join(root, *disk_rel.split('/'))
    if not os.path.exists(lp(disk)):
        if NO_MEDIA: return url
        try:
            W.download(url, disk)
        except Exception as e:
            _dl_fail.append((url, str(e))); return url
        print('   font +', disk_rel)
    return urllib.parse.quote(disk_rel, safe='/._-')

def outside_scripts(h, fn):
    parts = re.split(r'(<script\b[^>]*>.*?</script>)', h, flags=re.S | re.I)
    return ''.join(p if i % 2 else fn(p) for i, p in enumerate(parts))

# ---------- links ----------
def rewrite_links(h, site, mobile, desktop):
    hosts = '|'.join(re.escape(x) for x in site['hosts'])
    rx = re.compile(r'(href=")https?://(?:%s)(/[^"#?]*)?([?#][^"]*)?"' % hosts)
    def rep(m):
        slug = (m.group(2) or '/').strip('/') or 'index'
        tail = htmlmod.unescape(m.group(3) or '')
        if slug in mobile: tgt = slug + '.m.html'
        elif slug in desktop: tgt = slug + '.html'
        else: return m.group(0)
        return '%s%s%s"' % (m.group(1), tgt, htmlmod.escape(tail, quote=True))
    return rx.sub(rep, h)

# ---------- embeds ----------
def fill_embeds(h, site_key, page_desktop, root):
    mp = json.load(open(os.path.join(TOOLS, 'html_embeds_map.json')))
    n = 0
    for it in mp.get(site_key, []):
        if it['page'] != page_desktop: continue
        cid, url = it['comp'], it['url']
        src = 'embeds/' + url.rsplit('/', 1)[1] if 'filesusr.com/html/' in url else url
        if src.startswith('embeds/') and not os.path.exists(os.path.join(root, src)): continue
        filled = ('<wix-iframe data-src="" data-cm-embed="%s"><div class="vWU4ML"><iframe class="xxJnkq" title="%s" '
                  'name="htmlComp-iframe" width="100%%" height="100%%" allow="fullscreen" src="%s"></iframe></div></wix-iframe>'
                  ) % (cid, htmlmod.escape(it['title']), src)
        rx = re.compile(r'(<div id="%s" class="[^"]*\b%s\b[^"]*">)(</div>)' % (re.escape(cid), re.escape(cid)))
        h, k = rx.subn(lambda m: m.group(1) + filled + m.group(2), h, count=1)
        n += k
    return h, n

# ---------- injected head blocks ----------
DETECT = ("function P(){try{var q=/[?&]view=(mobile|desktop)/.exec(location.search);if(q)sessionStorage.setItem('cmView',q[1]);"
          "var v=sessionStorage.getItem('cmView');if(v)return v==='mobile'}catch(e){}var u=navigator.userAgent||'';"
          "if(/iPad|Tablet|Kindle|Silk|PlayBook/i.test(u))return false;"
          "return /Mobi|iPhone|iPod|Android.+Mobile|Windows Phone|BlackBerry|BB10|Opera Mini|IEMobile/i.test(u)||"
          "(Math.min(screen.width,screen.height)<=600&&!!window.matchMedia&&matchMedia('(pointer:coarse)').matches)}")

def desktop_block(slug, live):
    tgt = '/%s.m.html' % slug
    return (MARK[0] + '<script id="cm-mobile-redirect">(function(){%s if(P())location.replace(%s+location.search+location.hash)})();</script>'
            '<link rel="alternate" media="only screen and (max-width: 640px)" href="%s%s">' % (DETECT, json.dumps(tgt), live, tgt) + MARK[1])

MOBILE_CSS = ('#MENU_AS_CONTAINER[data-cm-open]{display:block!important;visibility:visible!important;opacity:1!important}'
              '#MENU_AS_CONTAINER[data-cm-open] #MENU_AS_CONTAINER_EXPANDABLE_MENU{visibility:visible!important}'
              '#MENU_AS_CONTAINER_EXPANDABLE_MENU li[data-cm-sub-open]>ul,#MENU_AS_CONTAINER_EXPANDABLE_MENU li[data-cm-sub-open]>div>ul{display:block!important;visibility:visible!important;opacity:1!important;height:auto!important;max-height:none!important;overflow:visible!important}'
              '#MENU_AS_CONTAINER_EXPANDABLE_MENU li[data-cm-sub-open]>div .wixui-vertical-menu__arrow{transform:rotate(180deg)}'
              'body[data-cm-menu-open]{overflow:hidden}html,body{max-width:100%}')
MOBILE_JS = r"""(function(){var OPEN_C='I_VSKP',TOG_C='d0L2ow';
function c(){return document.getElementById('MENU_AS_CONTAINER')}function t(){return document.getElementById('MENU_AS_CONTAINER_TOGGLE')}
function set(o){var m=c(),g=t();if(!m)return;if(o){m.setAttribute('data-cm-open','');m.setAttribute('data-undisplayed','false');m.classList.add(OPEN_C);document.body.setAttribute('data-cm-menu-open','')}else{m.removeAttribute('data-cm-open');m.setAttribute('data-undisplayed','true');m.classList.remove(OPEN_C);document.body.removeAttribute('data-cm-menu-open')}
if(g){g.classList.toggle(TOG_C,o);var i1=g.firstElementChild,i2=i1&&i1.firstElementChild;i1&&i1.classList.toggle(TOG_C,o);i2&&i2.classList.toggle('sqDofR',o);g.setAttribute('aria-label',o?'Close navigation menu':'Open navigation menu');g.setAttribute('aria-expanded',o?'true':'false')}}
function isOpen(){var m=c();return !!(m&&m.hasAttribute('data-cm-open'))}
document.addEventListener('click',function(e){var x=e.target;if(!x||!x.closest)return;
if(x.closest('#MENU_AS_CONTAINER_TOGGLE')){e.preventDefault();e.stopPropagation();set(!isOpen());return}
var li=x.closest('#MENU_AS_CONTAINER_EXPANDABLE_MENU li');
if(li&&li.querySelector('ul')&&(x.closest('button')||!x.closest('a[href]'))){e.preventDefault();e.stopPropagation();var o=li.hasAttribute('data-cm-sub-open');if(o)li.removeAttribute('data-cm-sub-open');else li.setAttribute('data-cm-sub-open','');var b=li.querySelector('button,[aria-expanded]');b&&b.setAttribute('aria-expanded',o?'false':'true');return}
if(x.closest('#MENU_AS_CONTAINER a[href]')){set(false);return}
if(isOpen()&&!x.closest('#MENU_AS_CONTAINER_EXPANDABLE_MENU')&&x.closest('#MENU_AS_CONTAINER')){set(false)}},true);
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&isOpen())set(false);if((e.key==='Enter'||e.key===' ')&&e.target&&e.target.id==='MENU_AS_CONTAINER_TOGGLE'){e.preventDefault();set(!isOpen())}},true);
window.addEventListener('pageshow',function(){set(false)})})();"""

def mobile_block(slug, live):
    desk = '/' if slug == 'index' else '/%s.html' % slug
    canon = live + ('/' if slug == 'index' else '/' + slug)
    return (MARK[0] + '<script id="cm-mobile-redirect">(function(){%s if(!P())location.replace(%s+location.search+location.hash)})();</script>'
            '<link rel="canonical" href="%s"><style id="cm-mobile-nav">%s</style><script id="cm-mobile-nav-js">%s</script>'
            % (DETECT, json.dumps(desk), canon, MOBILE_CSS, MOBILE_JS) + MARK[1])

def inject_head(h, block):
    h = re.sub(re.escape(MARK[0]) + '.*?' + re.escape(MARK[1]), '', h, flags=re.S)
    m = re.search(r'<head\b[^>]*>', h, re.I)
    return h[:m.end()] + block + h[m.end():]

def process_mobile(site_key, site, slug, raw, mobile, desktop):
    root = site['root']
    h = raw
    h = re.sub(r'<link rel="canonical"[^>]*>', '', h)  # replaced by ours (-> desktop URL)
    h = rewrite_links(h, site, mobile, desktop)
    h = outside_scripts(h, lambda part: MEDIA_RE.sub(lambda m: localize(root, m.group(0)), part))
    h, ne = fill_embeds(h, site_key, slug + '.html', root)
    empty = re.findall(r'<div id="(comp-\w+)" class="O5G82F [^"]*"></div>', h)
    if empty: print('   UNMAPPED HtmlComponents in', slug + '.m.html', empty)
    h = inject_head(h, mobile_block(slug, site['live']))
    return h, ne

def sitemap_slugs(site, raw_dir):
    cache = os.path.join(raw_dir, 'pages-sitemap.xml')
    if NO_FETCH and os.path.exists(cache):
        code, body = 'cached', read(cache)
    else:
        code, body = fetch_page(site, 'pages-sitemap.xml', DESKTOP_UA)
        if code == '200' and '<urlset' in body: write(cache, body)
    out = []
    for loc in re.findall(r'<loc>([^<]+)</loc>', body):
        p = urllib.parse.urlparse(loc.strip()).path.strip('/')
        out.append(urllib.parse.unquote(p) or 'index')
    return code, out

def add_missing_desktop(key, site, raw_dir):
    """Capture desktop markup for sitemap pages that have no desktop copy yet."""
    root = site['root']
    code, slugs = sitemap_slugs(site, raw_dir)
    print('  sitemap', code, slugs)
    have = set(desktop_pages(root))
    for slug in slugs:
        if slug in have: continue
        if slug in SKIP_SITEMAP.get(key, {}):
            print('  SKIP', slug, '-', SKIP_SITEMAP[key][slug]); continue
        rawp = os.path.join(raw_dir, slug + '.desktop.html')
        if not (NO_FETCH and os.path.exists(rawp)):
            code, body = fetch_page(site, slug, DESKTOP_UA)
            ok = code == '200' and '"deviceType":"desktop"' in body and 'wixDesktopViewport' in body
            print('  fetch desktop', slug, code, len(body), 'ok' if ok else 'FAILED')
            if not ok: continue
            write(rawp, body)
        have.add(slug)
    for slug in sorted(have):
        rawp = os.path.join(raw_dir, slug + '.desktop.html')
        if not os.path.exists(rawp): continue          # HTTrack-era page: leave as is
        h = read(rawp)
        h = rewrite_links(h, site, set(), have)
        h = outside_scripts(h, lambda part: MEDIA_RE.sub(lambda m: localize(root, m.group(0)), part))
        h, ne = fill_embeds(h, key, slug + '.html', root)
        empty = re.findall(r'<div id="(comp-\w+)" class="O5G82F [^"]*"></div>', h)
        write(os.path.join(root, slug + '.html'), h)
        print('  wrote desktop', slug + '.html', 'embeds:', ne, ('UNMAPPED HtmlComponents: %s' % empty) if empty else '')

def main():
    keys = [a for a in sys.argv[1:] if a in SITES] or list(SITES)
    for key in keys:
        site = SITES[key]; root = site['root']
        raw_dir = os.path.join(os.path.dirname(HOST_DIR), '_mobile_tmp', 'raw', key); os.makedirs(raw_dir, exist_ok=True)
        if ADD_MISSING: add_missing_desktop(key, site, raw_dir)
        desktop = desktop_pages(root)
        print('==', key, 'desktop pages:', desktop)
        captured = []
        for slug in desktop:
            rawp = os.path.join(raw_dir, slug + '.html')
            if not NO_FETCH or not os.path.exists(rawp):
                code, body = fetch_page(site, slug)
                ok = code == '200' and '"deviceType":"mobile"' in body and 'wixMobileViewport' in body
                print('  fetch', slug, code, len(body), 'mobile' if ok else 'NOT MOBILE/FAILED')
                if not ok: continue
                write(rawp, body)
            captured.append(slug)
        mobile = set(captured)
        for slug in captured:
            h, ne = process_mobile(key, site, slug, read(os.path.join(raw_dir, slug + '.html')), mobile, set(desktop))
            write(os.path.join(root, slug + '.m.html'), h)
            dp = os.path.join(root, slug + '.html')
            write(dp, inject_head(read(dp), desktop_block(slug, site['live'])))
            print('  wrote', slug + '.m.html', 'embeds:', ne)
        # VideoPlayer embeds on the mobile copies (desktop ones are already filled -> untouched)
        man = os.path.join(root, 'media', 'video', '_video_manifest.json')
        bak = man + '.bak'
        if os.path.exists(man): shutil.copyfile(man, bak)
        subprocess.run([sys.executable, os.path.join(TOOLS, 'fix_videos.py'), root], check=False)
        if os.path.exists(bak):
            if os.path.exists(man): shutil.move(man, man.replace('.json', '.mobile.json'))
            shutil.move(bak, man)
    # links to new pages / Wix documents, then desktop nav+footer+viewport fixes (idempotent)
    subprocess.run([sys.executable, os.path.join(TOOLS, 'fix_links.py')] + keys, check=False)
    subprocess.run([sys.executable, os.path.join(TOOLS, 'fix_static_nav.py')] + [SITES[k]['root'] for k in keys], check=False,
                   stdout=subprocess.DEVNULL)
    if _dl_fail:
        print('MEDIA DOWNLOAD FAILURES:'); [print('  ', u, e) for u, e in _dl_fail]

if __name__ == '__main__':
    main()
