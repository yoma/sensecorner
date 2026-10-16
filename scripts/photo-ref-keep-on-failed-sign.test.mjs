import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apps = ['selfsense.html', 'datesense.html', 'familysense.html', 'friendsense.html'];

function loadSenseCommon() {
  const code = fs.readFileSync(path.join(root, 'js/sense-common.js'), 'utf8');
  const sandbox = { console, URL };
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'sense-common.js' });
  return sandbox;
}

test('failed re-sign keeps the stored photo ref and a fresh URL replaces it', () => {
  const { senseMergeRefreshedPhotoRef, senseMergeRefreshedPhotoList } = loadSenseCommon();
  const storedPath = 'user-1/EmmaSense_1710000000000.jpg';
  const expired = 'https://example.supabase.co/storage/v1/object/sign/datesense-photos/user-1/EmmaSense_1710000000000.jpg?token=old';
  const fresh = 'https://example.supabase.co/storage/v1/object/sign/datesense-photos/user-1/EmmaSense_1710000000000.jpg?token=new';

  assert.equal(senseMergeRefreshedPhotoRef(storedPath, ''), storedPath);
  assert.equal(senseMergeRefreshedPhotoRef(expired, ''), expired);
  assert.equal(senseMergeRefreshedPhotoRef(storedPath, fresh), fresh);
  assert.equal(senseMergeRefreshedPhotoRef('  ', '  '), '');

  assert.deepEqual(
    Array.from(senseMergeRefreshedPhotoList([storedPath, expired, 'keep-me.jpg'], [fresh, '', ''])),
    [fresh, expired, 'keep-me.jpg']
  );
  assert.deepEqual(Array.from(senseMergeRefreshedPhotoList(['a.jpg', 'b.jpg'], [])), ['a.jpg', 'b.jpg']);
});

test('dossier hydrate no longer drops photo refs when refresh returns empty', () => {
  for (const file of apps) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.equal(html.includes('if(one)m.photo_url=one'), false, file + ' still replaces photo_url only when refresh succeeds and deletes otherwise');
    assert.match(html, /senseMergeRefreshedPhotoRef\(m\.photo_url,one\)/, file + ' photo_url');
    assert.match(html, /senseMergeRefreshedPhotoList\(src,urls\)/, file + ' lists');
    const merges = html.match(/senseMergeRefreshedPhotoList\(src,urls\)/g) || [];
    assert.equal(merges.length, 2, file + ' should keep both foto_urls and analysis_photos');
    assert.match(html, /sense-common\.js\?v=20261016a/);
  }
});
