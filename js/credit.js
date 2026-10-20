/* Paiement par Crédit Domestique (la banque de la famille, un autre projet Supabase).
   Même chemin que la cantine : le magasin (compte « entreprise ») crée une demande de paiement,
   puis le client l'accepte avec son identifiant et son code express (respond_charge).
   Les montants sont en centimes, comme dans la caisse. */
(function () {
  const cfg = (window.CAISSE_CONFIG || {}).credit || {};
  const lib = window.supabase;
  const on = !!(lib && lib.createClient && cfg.url && cfg.key && cfg.company);
  const client = on ? lib.createClient(cfg.url, cfg.key, { auth: { persistSession: false, autoRefreshToken: false, storageKey: 'inter-mm.credit-auth' } }) : null;

  const must = r => { if (r.error) throw r.error; return r.data; };

  /* Les personnes qui peuvent payer (sans lire les soldes ni les codes). */
  async function payers() {
    return must(await client.from('accounts').select('id, role, holder_name')
      .eq('archived', false).in('role', ['admin', 'parent', 'child']).order('holder_name'));
  }
  /* Vérifie le code express ; renvoie { id, holder_name, balance } ou null. */
  async function check(id, code) {
    const rows = must(await client.rpc('login_account', { p_account_id: id, p_code: code }));
    return (rows && rows[0]) || null;
  }
  /* Demande de paiement du magasin (rejouable : même id = même demande). */
  async function charge(id, payer, amount, reason) {
    const r = await client.from('charges').insert({ id, company_id: cfg.company, payer_id: payer, amount, reason, status: 'pending' });
    if (r.error && r.error.code !== '23505') throw r.error;
  }
  /* Le client accepte : l'argent passe de son compte à celui du magasin. */
  async function accept(chargeId, payer, code) {
    const rows = must(await client.rpc('respond_charge', { p_charge_id: chargeId, p_account_id: payer, p_code: code, p_accept: true }));
    return (rows && rows[0]) || { ok: false, message: 'Pas de réponse.' };
  }

  /* Sans contact : on lit où en est la demande (pending, accepted, refused). */
  async function status(id) {
    const rows = must(await client.from('charges').select('status').eq('id', id));
    return rows && rows[0] ? rows[0].status : null;
  }
  /* Le caissier abandonne : la demande encore en attente est refusée (rien n'est débité). */
  async function cancel(id) {
    must(await client.from('charges').update({ status: 'refused', responded_at: new Date().toISOString() }).eq('id', id).eq('status', 'pending'));
  }

  window.CREDIT = { on, payers, check, charge, accept, status, cancel };
})();
