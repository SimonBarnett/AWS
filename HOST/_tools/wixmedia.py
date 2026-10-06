"""Short, deterministic local paths for Wix media (static.wixstatic.com/media/...).

Wix transform URLs (…/media/<id>~mv2.jpg/v1/fill/w_..,h_..,…/<name>.jpg) produce very
long folder trees on disk (>260 chars on Windows). Every media asset is instead stored
flat as  media/i/<sha1(key)[:12]><ext>  where key is the normalised wixstatic path:
  'static.wixstatic.com/' + unquote(path) with '~' -> '_'  (HTTrack's on-disk form).
Used by shorten_paths.py (migration) and capture_mobile.py (new captures).
"""
import hashlib, os, re, urllib.parse, urllib.request

PREFIX = 'static.wixstatic.com/'
SHORT_DIR = 'media/i'
UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) '
      'Chrome/129.0 Safari/537.36')

def key_of(ref):
    """ref: absolute https://static.wixstatic.com/media/... or relative static.wixstatic.com/media/... (any encoding)."""
    r = ref.strip()
    r = re.sub(r'^(?:https?:)?//', '', r)
    r = re.sub(r'^(?:\./|/)+', '', r)
    r = r.split('#')[0].split('?')[0]
    r = urllib.parse.unquote(r)
    if not r.startswith(PREFIX): return None
    return r.replace('~', '_')

def short_of(key):
    name = key.rstrip('/').rsplit('/', 1)[-1]
    ext = os.path.splitext(name)[1].lower()
    if not re.fullmatch(r'\.[a-z0-9]{1,5}', ext or ''): ext = ''
    return '%s/%s%s' % (SHORT_DIR, hashlib.sha1(key.encode('utf-8')).hexdigest()[:12], ext)

def source_url(key):
    """Reconstruct a fetchable wixstatic URL from a normalised key."""
    p = key[len(PREFIX):]
    p = re.sub(r'(\b[0-9a-f]{6}_[0-9a-f]{32})_mv2', r'\1~mv2', p)
    p = re.sub(r'enc_av(?=[,/])', 'enc_avif', p)
    return 'https://' + PREFIX + urllib.parse.quote(p, safe='/,_.-~')

def variants(key):
    yield key
    if 'enc_avif' in key: yield key.replace('enc_avif', 'enc_av')
    elif re.search(r'enc_av(?=[,/])', key): yield re.sub(r'enc_av(?=[,/])', 'enc_avif', key)

def download(url, dest, referer='https://www.thesmartcatalogue.com/'):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Referer': referer,
          'Accept': 'image/png,image/jpeg,image/gif,image/svg+xml,font/woff2,*/*;q=0.5'})
    data = urllib.request.urlopen(req, timeout=60).read()
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, 'wb') as f: f.write(data)
    return len(data)

def localize(root, ref, fail=None, log=print):
    """Return the short relative path for a wixstatic media ref, downloading it if needed.
    Non-media refs (ufonts etc.) and failures return None."""
    key = key_of(ref)
    if not key or not key.startswith(PREFIX + 'media/'): return None
    short = short_of(key)
    dest = os.path.join(root, *short.split('/'))
    if os.path.exists(dest): return short
    try:
        n = download(source_url(key), dest)
        log('   media + %s <- %s (%d)' % (short, key[:110], n))
        return short
    except Exception as e:
        if fail is not None: fail.append((ref, str(e)))
        return None
