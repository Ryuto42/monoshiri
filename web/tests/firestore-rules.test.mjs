import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';

// Run with: npm run test:rules (starts the Firestore emulator around this script)
const env = await initializeTestEnvironment({
  projectId: 'demo-monoshiri',
  firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 },
});
const id = 'a1b2c3d4e5f6a1b2c3d4e5f6';
const now = Date.now();
const card = (o = {}) => ({ id, name: 'マグカップ', reading: 'まぐかっぷ', en: 'mug', category: 'くらし', icon: 'coffee', oneLiner: 'x', summary: 'y', funFact: 'z', topics: [], notes: [], illustration: '/media/illust/abc.webp', createdAt: now, updatedAt: now, ...o });
const ctx = (uid, provider, verified) => env.authenticatedContext(uid, { firebase: { sign_in_provider: provider }, email_verified: verified }).firestore();
const ref = (db, uid = 'u1', cid = id) => doc(db, 'users', uid, 'cards', cid);
let pass = 0, fail = 0;
async function t(name, p) { try { await p; pass++; console.log('ok  ', name); } catch (e) { fail++; console.log('FAIL', name, e.message?.slice(0, 120)); } }

const anon = ctx('u1', 'anonymous', false);
const google = ctx('u1', 'google.com', true);
const unverified = ctx('u1', 'password', false);
const verified = ctx('u1', 'password', true);
const other = ctx('u2', 'google.com', true);
const nobody = env.unauthenticatedContext().firestore();

await t('guest can save own card', assertSucceeds(setDoc(ref(anon), card())));
await t('guest can read own card', assertSucceeds(getDoc(ref(anon))));
await t('google user can save', assertSucceeds(setDoc(ref(google), card({ updatedAt: now + 1 }))));
await t('verified email user can read', assertSucceeds(getDoc(ref(verified))));
await t('verified email user can save', assertSucceeds(setDoc(ref(verified), card())));
await t('unverified email user cannot read', assertFails(getDoc(ref(unverified))));
await t('unverified email user cannot write', assertFails(setDoc(ref(unverified), card())));
await t('unverified email user can delete own card', assertSucceeds(deleteDoc(ref(unverified))));
await t('other user cannot delete', assertFails(deleteDoc(ref(other, 'u1'))));
await t('signed-out cannot delete', assertFails(deleteDoc(ref(nobody))));
await t('restore card after delete', assertSucceeds(setDoc(ref(verified), card())));
await t('other user cannot read', assertFails(getDoc(ref(other))));
await t('other user cannot write', assertFails(setDoc(ref(other, 'u1'), card())));
await t('signed-out cannot read', assertFails(getDoc(ref(nobody))));
await t('unknown field rejected', assertFails(setDoc(ref(anon), card({ photo: 'data:image/png;base64,AAAA' }))));
await t('extra field rejected', assertFails(setDoc(ref(anon), card({ admin: true }))));
await t('id mismatch rejected', assertFails(setDoc(ref(anon), card({ id: 'b1b2c3d4e5f6a1b2c3d4e5f6' }))));
await t('bad doc id rejected', assertFails(setDoc(ref(anon, 'u1', 'not-a-hash'), card({ id: 'not-a-hash' }))));
await t('long name rejected', assertFails(setDoc(ref(anon), card({ name: 'あ'.repeat(41) }))));
await t('empty name rejected', assertFails(setDoc(ref(anon), card({ name: '' }))));
await t('huge summary rejected', assertFails(setDoc(ref(anon), card({ summary: 'x'.repeat(4001) }))));
await t('too many notes rejected', assertFails(setDoc(ref(anon), card({ notes: Array(13).fill({}) }))));
await t('external illustration rejected', assertFails(setDoc(ref(anon), card({ illustration: 'https://evil.example/x.png' }))));
await t('path traversal illustration rejected', assertFails(setDoc(ref(anon), card({ illustration: 'javascript:alert(1)' }))));
await t('dot-dot illustration rejected', assertFails(setDoc(ref(anon), card({ illustration: '/media/illust/../../secret.webp' }))));
await t('dot-dot in name rejected', assertFails(setDoc(ref(anon), card({ illustration: '/media/illust/a..webp' }))));
await t('firstFind ok', assertSucceeds(setDoc(ref(anon), card({ firstFind: true }))));
await t('non-bool firstFind rejected', assertFails(setDoc(ref(anon), card({ firstFind: 'yes' }))));
await t('notes of maps ok', assertSucceeds(setDoc(ref(anon), card({ notes: [{ topicId: 't0', title: 'x', text: 'y' }] }))));
await t('non-map note rejected', assertFails(setDoc(ref(anon), card({ notes: ['x'] }))));
await t('non-map later note rejected', assertFails(setDoc(ref(anon), card({ notes: [{}, {}, 42] }))));
await t('non-map topic rejected', assertFails(setDoc(ref(anon), card({ topics: ['x'] }))));
await t('null illustration ok', assertSucceeds(setDoc(ref(anon), card({ illustration: null }))));
await t('future updatedAt rejected', assertFails(setDoc(ref(anon), card({ updatedAt: now + 3600_000 }))));
await t('string timestamp rejected', assertFails(setDoc(ref(anon), card({ createdAt: 'now' }))));
await t('missing notes rejected', assertFails(setDoc(ref(anon), (({ notes, ...r }) => r)(card()))));
await t('card with units ok', assertSucceeds(setDoc(ref(anon), card({ units: ['e5-sci-dissolve', 'j1-sci-plants'] }))));
await t('empty units ok', assertSucceeds(setDoc(ref(anon), card({ units: [] }))));
await t('five units ok', assertSucceeds(setDoc(ref(anon), card({ units: ['u1', 'u2', 'u3', 'u4', 'u5'] }))));
await t('six units rejected', assertFails(setDoc(ref(anon), card({ units: ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'] }))));
await t('units as string rejected', assertFails(setDoc(ref(anon), card({ units: 'e5-sci-dissolve' }))));
await t('units as map rejected', assertFails(setDoc(ref(anon), card({ units: { a: 'e5-sci-dissolve' } }))));
await t('non-string unit rejected', assertFails(setDoc(ref(anon), card({ units: [42] }))));
await t('non-string later unit rejected', assertFails(setDoc(ref(anon), card({ units: ['u1', 'u2', 'u3', 'u4', { x: 1 }] }))));
await t('long unit id rejected', assertFails(setDoc(ref(anon), card({ units: ['x'.repeat(21)] }))));
await t('cache collection closed', assertFails(getDoc(doc(google, 'cache_explore', 'x'))));
await t('meter closed', assertFails(setDoc(doc(google, 'meter', 'x'), { a: 1 })));
await t('other users root closed', assertFails(setDoc(doc(google, 'users', 'u1'), { a: 1 })));
await t('owner can delete', assertSucceeds(deleteDoc(ref(anon))));
const prof = (db, uid = 'u1') => doc(db, 'users', uid);
await t('member can save stage', assertSucceeds(setDoc(prof(google), { stage: 'junior', updatedAt: now })));
await t('member can read stage', assertSucceeds(getDoc(prof(google))));
await t('verified email member can save stage', assertSucceeds(setDoc(prof(verified), { stage: 'lower', updatedAt: now })));
await t('guest cannot save stage', assertFails(setDoc(prof(anon), { stage: 'junior', updatedAt: now })));
await t('unverified cannot save stage', assertFails(setDoc(prof(unverified), { stage: 'junior', updatedAt: now })));
await t('age itself rejected', assertFails(setDoc(prof(google), { stage: 'junior', age: 13, updatedAt: now })));
await t('unknown stage rejected', assertFails(setDoc(prof(google), { stage: 'kindergarten', updatedAt: now })));
await t('other user cannot read stage', assertFails(getDoc(prof(other, 'u1'))));
await t('user meter closed', assertFails(getDoc(doc(google, 'meter_users', 'u1'))));
console.log(`\n${pass} passed, ${fail} failed`);
await env.cleanup();
process.exit(fail ? 1 : 0);
