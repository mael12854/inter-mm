/* Synchronisation avec Supabase.
   Chaque modification part dans une file d'attente gardée dans le navigateur, puis est envoyée.
   Sans réseau, la caisse continue de marcher : la file repart dès que la connexion revient. */
(function () {
  const cfg = window.CAISSE_CONFIG || {};
  const lib = window.supabase;
  const on = !!(lib && lib.createClient && cfg.url && cfg.key);
  const client = on ? lib.createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'inter-mm.auth' } }) : null;

  const OUT_KEY = 'inter-mm.outbox.v1';
  let outbox = [];
  try { outbox = JSON.parse(localStorage.getItem(OUT_KEY) || '[]'); } catch (e) { outbox = []; }
  let flushing = null, lastError = null;
  const listeners = [];

  function persist() { try { localStorage.setItem(OUT_KEY, JSON.stringify(outbox)); } catch (e) { /* rien */ } }
  function state() {
    if (!on) return 'local';
    if (!navigator.onLine) return 'offline';
    if (lastError && outbox.length) return 'error';
    return outbox.length ? 'pending' : 'ok';
  }
  function emit() { const s = state(); listeners.forEach(fn => { try { fn(s, outbox.length); } catch (e) { /* rien */ } }); }

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  async function run(op) {
    let r;
    if (op.kind === 'upsert') r = await client.from(op.table).upsert(op.row);
    else if (op.kind === 'insertIgnore') r = await client.from(op.table).upsert(op.row, { ignoreDuplicates: true });
    else if (op.kind === 'delete') r = await client.from(op.table).delete().eq(op.key, op.value);
    else if (op.kind === 'rpc') r = await client.rpc(op.fn, op.args || {});
    else return null;
    if (r.error) throw r.error;
    return r.data;
  }
  /* Une erreur « définitive » (donnée refusée par la base) ne doit pas bloquer la file. */
  const permanent = e => !!(e && e.code && /^(22|23|42|PGRST2)/.test(e.code) && e.code !== '42501');

  function queue(op) {
    if (!on) return;
    op.qid = uid();
    outbox.push(op); persist(); emit();
    flush();
  }
  function flush() {
    if (!on) return Promise.resolve();
    if (flushing) return flushing;
    flushing = (async () => {
      while (outbox.length && navigator.onLine) {
        const op = outbox[0];
        try { await run(op); outbox.shift(); persist(); lastError = null; }
        catch (e) {
          if (permanent(e)) { console.warn('Supabase a refusé une modification', op, e); outbox.shift(); persist(); continue; }
          lastError = e; break;
        }
      }
    })().finally(() => { flushing = null; emit(); });
    return flushing;
  }

  async function call(fn, args) {
    const r = await client.rpc(fn, args || {});
    if (r.error) throw r.error;
    return r.data;
  }

  async function pull() {
    await flush();
    if (outbox.length) return null; // des modifications locales attendent : on ne les écrase pas
    const q = (p) => p.then(r => { if (r.error) throw r.error; return r.data; });
    const [articles, cartes, personnel, reglages, ouverts, recents] = await Promise.all([
      q(client.from('articles').select('id, rayon, ppp, nom, prix, vente, ean')),
      q(client.from('cartes').select('num, nom, tampons, surprises')),
      q(client.from('personnel').select('*').order('ordre')),
      q(client.from('reglages').select('cle, valeur')),
      q(client.from('tickets').select('no, statut, jour, ferme_le, caissier, total, articles, remises, lignes_annulees, especes, carte').is('cloture_id', null).order('ferme_le')),
      q(client.from('tickets').select('no, statut, detail').order('ferme_le', { ascending: false }).limit(30))
    ]);
    lastError = null; emit();
    return { articles, cartes, personnel, reglages, ouverts, recents };
  }

  async function session() {
    if (!on) return null;
    const r = await client.auth.getSession();
    return r.data && r.data.session;
  }
  async function signIn(email, password) {
    const r = await client.auth.signInWithPassword({ email, password });
    if (r.error) throw r.error;
    return r.data.session;
  }
  async function signUp(email, password) {
    const redirect = /^https?:/.test(location.protocol) ? location.origin + location.pathname : undefined;
    const r = await client.auth.signUp({ email, password, options: redirect ? { emailRedirectTo: redirect } : {} });
    if (r.error) throw r.error;
    return r.data;
  }
  async function signOut() { if (on) await client.auth.signOut(); outbox = []; persist(); emit(); }
  async function isMember() {
    const r = await client.from('membres').select('user_id').limit(1);
    if (r.error) throw r.error;
    return r.data.length > 0;
  }
  function onAuth(fn) { if (on) client.auth.onAuthStateChange((ev, s) => fn(ev, s)); }

  window.addEventListener('online', () => { emit(); flush(); });
  window.addEventListener('offline', emit);
  setInterval(() => { if (outbox.length) flush(); }, 15000);

  window.CLOUD = {
    on, uid, queue, flush, pull, call, session, signIn, signUp, signOut, isMember, onAuth, state,
    pending: () => outbox.length,
    onChange: fn => { listeners.push(fn); fn(state(), outbox.length); }
  };
})();
