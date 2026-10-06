"""Restore Wix VideoPlayer + background videos as static, self-hosted media.
Usage: python fix_videos.py <appRoot> [--no-download] [--dry]
"""
import re, sys, os, json, html, urllib.request, glob

ROOT = sys.argv[1]
DRY = '--dry' in sys.argv
NODL = '--no-download' in sys.argv
UA = {'User-Agent': 'Mozilla/5.0'}
MEDIA_DIR = os.path.join(ROOT, 'media', 'video')
REL = 'media/video/'
_cache = {}

def fetch(url):
    if url in _cache: return _cache[url]
    d = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()
    _cache[url] = d
    return d

def download(url, name):
    path = os.path.join(MEDIA_DIR, name)
    if NODL or DRY or (os.path.exists(path) and os.path.getsize(path) > 1000):
        return REL + name
    os.makedirs(MEDIA_DIR, exist_ok=True)
    data = fetch(url)
    with open(path, 'wb') as f: f.write(data)
    print('   downloaded', name, len(data))
    return REL + name

# Empty Wix VideoPlayer roots: (a) SSR shell with no children, (b) HTTrack-captured
# YouTube container with empty inner div, (c) HTTrack-captured empty Playable container.
_INNER = (r'(?:'
          r'|<div class="VideoPlayer\d+__playerContainer"[^>]*><div></div></div>'
          r'|<div [^>]*class="VideoPlayer\d+__playerContainer"[^>]*></div>'
          r')')
def player_re(cid):
    return re.compile(r'((<div id="%s" class="VideoPlayer\d+__root[^"]*"[^>]*>)%s</div>)' % (re.escape(cid), _INNER))
PLAYER_RE = re.compile(r'<div id="(comp-[\w]+)" class="VideoPlayer\d+__root[^"]*"[^>]*>%s</div>' % _INNER)

def comp_props(h):
    props = {}
    for u in set(re.findall(r'https://siteassets\.parastorage\.com/pages/pages/thunderbolt\?[^"\s]*module=thunderbolt-features[^"\s]*', h)):
        u = u.replace('&amp;', '&')
        try:
            d = json.loads(fetch(u))
        except Exception as e:
            print('   features fetch failed', e); continue
        cp = d.get('props', {}).get('render', {}).get('compProps', {})
        for k, v in cp.items():
            if isinstance(v, dict) and 'src' in v and isinstance(v.get('src'), str) and ('video' in v['src'] or 'youtu' in v['src'] or 'vimeo' in v['src']):
                props[k] = v
    return props

def yt_id(src):
    m = re.search(r'(?:youtu\.be/|v=|embed/|shorts/)([\w-]{11})', src)
    return m.group(1) if m else None

def player_html(cid, p):
    src = p['src']
    style = 'width:100%;height:100%;border:0;display:block;background:#000'
    if 'youtu' in src:
        vid = yt_id(src)
        return (f'<iframe class="cm-static-video" data-cm-video="{cid}" src="https://www.youtube.com/embed/{vid}?rel=0{'&amp;autoplay=1&amp;mute=1' if p.get('autoplay') else ''}" '
                f'title="YouTube video player" style="{style}" loading="lazy" '
                f'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" '
                f'referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>'), f'https://youtu.be/{vid}'
    if 'vimeo' in src:
        vid = re.search(r'vimeo\.com/(?:video/)?(\d+)', src).group(1)
        return (f'<iframe class="cm-static-video" data-cm-video="{cid}" src="https://player.vimeo.com/video/{vid}" style="{style}" '
                f'loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>'), src
    m = re.search(r'video/([\w]+)/(\d+p)/mp4/file\.mp4', src)
    vid, q = m.group(1), m.group(2)
    local = download(src, f'{vid}-{q}.mp4')
    poster = ''
    pc = (p.get('playableConfig') or {}).get('poster') or {}
    if pc.get('uri'):
        purl = 'https://static.wixstatic.com/media/' + pc['uri']
        try:
            poster = download(purl, pc['uri'])
        except Exception as e:
            print('   poster failed', e)
    attrs = ' controls' if p.get('controls', True) else ''
    if p.get('loop'): attrs += ' loop'
    if p.get('muted') or p.get('autoplay'): attrs += ' muted'
    if p.get('autoplay'): attrs += ' autoplay'
    pa = f' poster="{poster}"' if poster else ''
    return (f'<video class="cm-static-video" data-cm-video="{cid}"{attrs} playsinline preload="metadata"{pa} '
            f'style="{style};object-fit:contain"><source src="{local}" type="video/mp4"></video>'), src

def fix_bg(h, log):
    """Wix background videos (<wix-video data-video-info>): Wix's inline custom element would point
    the <video> at video.wixstatic.com. Download one quality locally and give the <video> a static
    src/autoplay/loop/object-fit; cm-wix-guard (vendor_wix.py) stops the Wix element from running."""
    def rep(m):
        tag, info_raw, video_tag = m.group(1), m.group(2), m.group(3)
        if ' src=' in video_tag:
            return m.group(0)
        info = json.loads(html.unescape(info_raw))
        quals = [q for q in info.get('qualities', []) if q.get('url')]
        order = ['720p', '480p', '1080p', '360p']
        quals.sort(key=lambda q: order.index(q['quality']) if q['quality'] in order else 9)
        local = None
        for q in quals:
            url = 'https://video.wixstatic.com/' + q['url']
            try:
                vid = re.search(r'video/([\w]+)/', q['url']).group(1)
                local = download(url, f"{vid}-{q['quality']}.mp4"); chosen = url; break
            except Exception as e:
                print('   bg quality failed', q['quality'], e)
        if not local:
            return m.group(0)
        log.append(('bg', vid, chosen, local))
        fit = 'contain' if info.get('fittingType') in ('fit', 'legacy_fit_width', 'legacy_fit_height') else 'cover'
        pos = {'top': 'center top', 'bottom': 'center bottom', 'left': 'left center', 'right': 'right center',
               'top_left': 'left top', 'top_right': 'right top', 'bottom_left': 'left bottom',
               'bottom_right': 'right bottom'}.get(info.get('alignType'), 'center center')
        nv = video_tag.replace('<video ', f'<video src="{local}" autoplay data-cm-bg="1" '
                               f'style="width:100%;height:100%;object-fit:{fit};object-position:{pos}" ', 1)
        for a in ('muted', 'loop', 'playsinline'):
            if not re.search(r'\s%s(=|\s|>|/)' % a, nv):
                nv = nv.replace('<video ', f'<video {a} ', 1)
        return tag + nv
    return re.sub(r'(<wix-video [^>]*data-video-info="([^"]+)"[^>]*>)(<video [^>]*>)', rep, h)

GUARD = '''<style id="cm-static-video-css">wix-video video[src]{opacity:1!important;visibility:visible!important}.cm-static-video{width:100%;height:100%}</style>
<script id="cm-static-video-js">document.addEventListener('DOMContentLoaded',function(){document.querySelectorAll('wix-video video[src]').forEach(function(v){v.muted=true;var p=v.play();if(p&&p.catch)p.catch(function(){});var img=v.parentNode.querySelector('img');if(img){v.addEventListener('playing',function(){img.style.opacity='0'})}})});</script>'''

def main():
    files = sorted(glob.glob(os.path.join(ROOT, '*.html')))
    report = []
    for f in files:
        with open(f, encoding='utf-8', newline='') as fh: h = fh.read()
        orig = h
        empties = [m.group(1) for m in PLAYER_RE.finditer(h)]
        has_bg = ('--bg' in sys.argv) and '<wix-video ' in h
        if not empties and not has_bg: continue
        print(os.path.basename(f), 'players:', empties)
        log = []
        if empties:
            props = comp_props(h)
            for cid in empties:
                p = props.get(cid)
                if not p:
                    print('   no props for', cid); continue
                ph, used = player_html(cid, p)
                h = re.sub(player_re(cid), lambda m: m.group(2) + ph + '</div>', h, count=1)
                log.append(('player', cid, used, ph[:120]))
        if has_bg:
            h = fix_bg(h, log)
        if h != orig and 'cm-static-video-js' not in h:
            h = h.replace('</head>', GUARD + '</head>', 1)
        for l in log: print('  ', l[:3])
        report.append((os.path.basename(f), log))
        if h != orig and not DRY:
            with open(f, 'w', encoding='utf-8', newline='') as fh: fh.write(h)
    if not DRY: os.makedirs(MEDIA_DIR, exist_ok=True)
    with open(os.path.join(MEDIA_DIR, '_video_manifest.json') if not DRY else os.devnull, 'w') as fh:
        json.dump(report, fh, indent=1)

if __name__ == '__main__':
    main()
