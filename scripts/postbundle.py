import os, shutil, sys

src = sys.argv[1] if len(sys.argv) > 1 else 'bundles/dist/AquaManga'

js_path = os.path.join(src, 'index.js')
if os.path.exists(js_path):
    with open(js_path) as f:
        content = f.read()

    content = content.replace('var source=(()=>{', 'var _Sources=(()=>{')

    closure_marker = '})();'
    last_closure = content.rfind(closure_marker)
    if last_closure >= 0:
        insert_pos = last_closure + len(closure_marker)
        global_assign = '\ntry { globalThis.Sources = _Sources; } catch(e) {}'
        content = content[:insert_pos] + global_assign + content[insert_pos:]
        print('Added globalThis.Sources = _Sources')

    new_path = os.path.join(src, 'source.js')
    with open(new_path, 'w') as f:
        f.write(content)
    os.remove(js_path)
    print(f'Renamed index.js -> source.js (var _Sources global)')
else:
    print(f'No index.js found at {js_path}')

static_icon = os.path.join(src, 'static', 'icon.png')
if os.path.exists(static_icon):
    os.makedirs(os.path.join(src, 'includes'), exist_ok=True)
    shutil.move(static_icon, os.path.join(src, 'includes', 'icon.png'))
    shutil.rmtree(os.path.join(src, 'static'))
    print('Moved icon to includes/')
else:
    print('No static/icon.png found')

info_path = os.path.join(src, 'info.json')
if os.path.exists(info_path):
    os.remove(info_path)
    print('Removed info.json')
