"""Restore Wix HtmlComponent embeds (Club Madeira S3 widgets) on Amplify static exports.

Wix renders HtmlComponent iframes client-side from siteassets; the static Amplify
export ships an empty <div id="comp-..." class="O5G82F ..."></div>. This script
injects the same iframe markup Wix produces, pointing at a local copy of the
original filesusr.com embed (which loads widgets from madeira-widget-bucket).

Usage: python HOST/_tools/fix_html_embeds.py   (run from repo root)
"""
import json, os, sys, html

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # HOST/
APPS = {
    'sc': os.path.join(ROOT, 'smartcatalogue', 'www.thesmartcatalogue.com'),
    'cm': os.path.join(ROOT, 'clubmadeira', 'www.clubmadeira.uk'),
}
MAP = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'html_embeds_map.json')))

def iframe_src(url):
    if 'filesusr.com/html/' in url:
        return 'embeds/' + url.rsplit('/', 1)[1]
    return url

changed = 0
for site, items in MAP.items():
    app = APPS[site]
    for it in items:
        page = os.path.join(app, it['page'])
        cid = it['comp']
        src = iframe_src(it['url'])
        if src.startswith('embeds/') and not os.path.exists(os.path.join(app, src)):
            sys.exit('missing embed file %s/%s' % (app, src))
        with open(page, 'r', encoding='utf-8') as f:
            s = f.read()
        empty = '<div id="%s" class="O5G82F %s"></div>' % (cid, cid)
        filled = ('<div id="%s" class="O5G82F %s"><wix-iframe data-src="" data-cm-embed="%s">'
                  '<div class="vWU4ML"><iframe class="xxJnkq" title="%s" name="htmlComp-iframe" '
                  'width="100%%" height="100%%" allow="fullscreen" src="%s"></iframe></div>'
                  '</wix-iframe></div>') % (cid, cid, cid, html.escape(it['title']), src)
        if filled in s:
            print('ok   ', site, it['page'], cid); continue
        if s.count(empty) != 1:
            print('WARN ', site, it['page'], cid, 'empty div count', s.count(empty)); continue
        s = s.replace(empty, filled)
        with open(page, 'w', encoding='utf-8', newline='') as f:
            f.write(s)
        changed += 1
        print('fixed', site, it['page'], cid, '->', src)
print('changed', changed)
