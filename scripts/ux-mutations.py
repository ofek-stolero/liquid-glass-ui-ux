import json, subprocess, sys, os
from concurrent.futures import ThreadPoolExecutor
SRC = sys.argv.pop(1) if len(sys.argv) > 1 and sys.argv[1].endswith('.html') else os.path.join(os.path.dirname(__file__), '../examples/music.html')
AUD = os.path.join(os.path.dirname(__file__), 'ux-audit.mjs')
base = open(SRC).read()
M = [  # (name, old, new, area, expected failing check)
 ('no-viewport', '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">', '', 'phone', 'idiom'),
 ('navigate-instead', 'LUX.present = function (o) {', 'LUX.present = function (o) { location.hash = "album";', 'phone', 'entity-sheet'),
 ('no-press', "pressed = { el, x: e.clientX, y: e.clientY, id: e.pointerId }; el.setAttribute('data-pressed', '');", "pressed = { el, x: e.clientX, y: e.clientY, id: e.pointerId };", 'phone', 'press'),
 ('hard-edge', "content.style.translate = y ? `0 ${y}px` : '';", "content.style.translate = '';", 'phone', 'overscroll'),
 ('no-skeleton', 'LUX.load(body, fetchAlbum(a), { skeleton: sk,', 'LUX.load(body, fetchAlbum(a), { skeleton: () => "",', 'phone', 'skeleton'),
 ('skeleton-flash', 'o = Object.assign({ delay: 120, minShow: 350', 'o = Object.assign({ delay: 0, minShow: 350', 'phone', 'no-flash'),
 ('no-drag-dismiss', 'if (best === closeY) { close(false, v); return; }', '', 'phone', 'sheet-drag'),
 ('no-escape', "const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); }", "const key = (e) => {", 'phone', 'escape'),
 ('focus-lost', 'if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true });', '', 'phone', 'focus-return'),
 ('page-steals-sheet-drag', "const FOREIGN = '", "const FOREIGN = '#nothing'; const FOREIGN_OFF = '", 'phone', 'focus-return'),
 ('no-hold', "}, o.delay || 450); });", "}, 999999); });", 'phone', 'hold-menu'),
 ('rm-ignored', 'if (RM() || opts.instant) {', 'if (opts.instant) {', 'phone', 'reduced-motion'),
 ('mac-is-phone', "if (w < 700) return 'phone';", "if (w < 7000) return 'phone';", 'mac', 'idiom'),
 ('mac-squash', ':root[data-idiom="mac"].lux :where([data-pressed]):not([data-gl]){ scale: 1; opacity: .7; }', '', 'mac', 'no-squash'),
 ('mac-dim-menu', "lay.className = 'lux-ctx-layer' + (LUX.idiom() === 'mac' || px === undefined ? ' lux-ctx-mac' : '');", "lay.className = 'lux-ctx-layer';", 'mac', 'right-click'),
 ('mac-no-cmdf', "'mod+f': () => { if (mac()) $('#q').focus(); },", '', 'mac', 'cmd-f'),
]
def run(m):
    name, a, b, area, chk = m
    assert base.count(a) >= 1, name
    os.makedirs('/tmp/uxmut', exist_ok=True); p = f'/tmp/uxmut/{name}.html'; open(p, 'w').write(base.replace(a, b))
    r = subprocess.run(['node', AUD, p, '--only', area, '--json'], capture_output=True, text=True, timeout=900)
    try: j = json.loads(r.stdout[r.stdout.index('{'):])
    except Exception: return (name, False, 'audit crashed: ' + r.stderr[-200:])
    fails = [x['name'] for x in j['results'] if not x['pass']]
    return (name, chk in fails, f'expected {area}/{chk}; failing: {fails}')
only = sys.argv[1:]
if only: M = [m for m in M if m[0] in only]
with ThreadPoolExecutor(2) as ex: res = list(ex.map(run, M))
for n, okk, d in res: print('CAUGHT' if okk else 'MISSED', n.ljust(24), d)
print(f'{sum(r[1] for r in res)}/{len(res)} mutations caught')
