/* Caisse Inter-Marin-et-Maël — logique et écrans. */
(function () {
  const { eur, num, kg, rayon, picto, SOUND, RAYONS } = DATA;
  const $ = id => document.getElementById(id);
  const $stage = $('stage'), $screen = $('screen'), $modal = $('modal-layer');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad4 = n => String(n).padStart(4, '0');
  const two = n => String(n).padStart(2, '0');
  const hhmm = d => { d = d ? new Date(d) : new Date(); return `${two(d.getHours())}:${two(d.getMinutes())}`; };
  const ddmmyyyy = d => { d = d ? new Date(d) : new Date(); return `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()}`; };

  let db = DATA.load();
  const save = () => DATA.save(db);

  const S = {
    screen: db.user ? 'main' : 'login',
    login: { who: null, pin: '', shake: false },
    saisie: '', mult: null, sel: -1,
    modal: null,
    produce: { rayon: 1, pid: null, entry: '', qty: 1 },
    cash: { received: 0 },
    done: null,
    catRayon: 0,
    label: { tab: 'produit', rayon: 1, pid: null, shelf: 1, card: 42, copies: 1 }
  };

  /* ——— Ticket et calculs ——— */
  const user = () => db.staff.find(s => s.id === db.user) || null;
  function newTicket() {
    db.ticketNo += 1;
    return { no: db.ticketNo, lines: [], tdisc: 0, tdiscNote: '', card: null, payments: [], returnNext: false, opened: Date.now() };
  }
  function cur() {
    if (!db.current) { db.current = newTicket(); save(); }
    return db.current;
  }
  const lineBase = l => (l.unit === 'kg' ? Math.round(l.qty * l.pu / 1000) : l.qty * l.pu);
  const lineDisc = l => Math.min(l.disc || 0, lineBase(l));
  const lineTotal = l => (l.cancelled ? 0 : (l.ret ? -1 : 1) * (lineBase(l) - lineDisc(l)));
  function totals(t) {
    const active = t.lines.filter(l => !l.cancelled);
    const sub = active.reduce((s, l) => s + lineTotal(l), 0);
    const tdisc = Math.min(t.tdisc || 0, Math.max(0, sub));
    const total = sub - tdisc;
    const disc = active.reduce((s, l) => s + lineDisc(l), 0) + tdisc;
    const items = active.filter(l => !l.ret).reduce((s, l) => s + (l.unit === 'kg' ? 1 : l.qty), 0);
    const paid = t.payments.reduce((s, p) => s + p.amount, 0);
    return { sub, tdisc, total, disc, items, paid, remaining: total - paid, cancelled: t.lines.filter(l => l.cancelled).length };
  }
  const selLine = () => cur().lines[S.sel] || null;

  function coins(c) {
    const D = [[5000, '50 €'], [2000, '20 €'], [1000, '10 €'], [500, '5 €'], [200, '2 €'], [100, '1 €'], [50, '50 c'], [20, '20 c'], [10, '10 c'], [5, '5 c'], [2, '2 c'], [1, '1 c']];
    const out = [];
    for (const [v, l] of D) { const n = Math.floor(c / v); if (n) { out.push(`${n} × ${l}`); c -= n * v; } }
    return out.join(' · ');
  }

  /* ——— Retours visuels : flash, bandeau, message ——— */
  let lastFlash = 0, flashTimer = 0, bannerTimer = 0, toastTimer = 0;
  function flash(kind, big, name, price) {
    const now = Date.now();
    const chain = kind === 'bip' && now - lastFlash < 1500 && S.screen === 'main';
    lastFlash = now;
    if (chain) {
      const b = $('banner');
      b.innerHTML = `<b>${esc(big)}</b><span>${esc(name)}</span><span class="mono">${esc(price)}</span>`;
      b.className = 'on';
      clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { b.className = ''; }, 900);
      $('flash').className = '';
      return;
    }
    const f = $('flash');
    f.innerHTML = `<span class="f-big">${esc(big)}</span><span class="f-name">${esc(name)}</span>${price ? `<span class="f-price">${esc(price)}</span>` : ''}`;
    f.className = 'on ' + kind;
    clearTimeout(flashTimer); flashTimer = setTimeout(() => { f.className = ''; }, 600);
  }
  function toast(msg, warn) {
    const t = $('toast');
    t.textContent = msg; t.className = 'on' + (warn ? ' warn' : '');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = ''; }, 1900);
  }
  function blinkScanner() {
    const s = $('st-scan'); if (!s) return;
    s.classList.add('blink'); setTimeout(() => s.classList.remove('blink'), 300);
  }

  /* ——— Ajout d'articles ——— */
  function lineFlash(l, merged) {
    const t = lineTotal(l);
    let price = eur(t);
    if (l.unit === 'kg') price = `${kg(l.qty)} kg × ${eur(l.pu)} = ${eur(t)}`;
    else if (l.qty > 1) price = `${l.qty} × ${eur(l.pu)} = ${eur(t)}`;
    flash('bip', l.ret ? 'Retour' : merged ? 'Encore un !' : 'Bip !', l.name, price);
  }

  function addLine(o) {
    const t = cur();
    const usedMult = o.qty == null && S.mult != null;
    const qty = o.qty != null ? o.qty : (S.mult || 1);
    const ret = t.returnNext;
    const last = t.lines[t.lines.length - 1];
    const sameItem = last && (o.pid || o.code) && last.pid === (o.pid || null) && last.code === (o.code || null) && last.pu === o.pu;
    let line, merged = false;
    if (!usedMult && !ret && o.unit === 'piece' && sameItem && !last.cancelled && !last.ret && !last.disc && last.unit === 'piece') {
      last.qty += qty; line = last; merged = true;
      SOUND.encore();
    } else {
      line = {
        id: Date.now() + '-' + t.lines.length, pid: o.pid || null, name: o.name, code: o.code || null,
        pu: o.pu, unit: o.unit, qty, note: usedMult ? `${qty} × saisi au pavé` : (o.note || ''),
        disc: 0, discNote: '', cancelled: false, ret
      };
      t.lines.push(line);
      SOUND.bip();
    }
    if (ret) t.returnNext = false;
    S.sel = t.lines.indexOf(line);
    S.mult = null; S.saisie = '';
    save();
    S.screen = 'main'; S.modal = null;
    render();
    lineFlash(line, merged);
  }

  function addProduct(p, code) {
    addLine({
      pid: p.id, name: p.name, code: code || null, pu: p.price, unit: p.unit === 'kg' ? 'kg' : 'piece',
      note: code ? code.slice(0, 7) + '…' : `Rayon ${p.rayon} · ${p.unit === 'barq' ? 'barquette' : 'pièce'}`
    });
  }

  function oups(code, msg) {
    SOUND.oups();
    S.saisie = '';
    S.modal = { type: 'oups', code, msg: msg || 'Je ne connais pas ce produit' };
    render();
  }

  function attachCard(n) {
    let c = db.cards[n];
    if (!c) { c = db.cards[n] = { num: n, name: 'Copain n° ' + pad4(n), stamps: 0, surprises: 0 }; }
    cur().card = n; save();
    SOUND.copain();
    render();
    flash('copain', 'Copain !', c.name, `${c.stamps} tampon${c.stamps > 1 ? 's' : ''} sur 10`);
  }

  function handleCode(code) {
    const h = EAN.parseHouse(code);
    if (h && h.kind === 'copains') return attachCard(h.num);
    if (h && h.kind === 'badge') { const s = db.staff.find(x => x.badge === h.num); return toast(s ? `Badge de ${s.name}` : 'Badge inconnu', true); }
    const p = db.products.find(x => x.ean && (x.ean === code || x.ean === '0' + code));
    if (p) {
      if (p.unit === 'kg') return openProduce(p);
      return addProduct(p, code);
    }
    if (h && h.kind === 'house' && h.rayon >= 1 && h.rayon <= 8) {
      const p2 = db.products.find(x => x.rayon === h.rayon && x.ppp === h.ppp);
      if (p2 && p2.unit === 'kg') return openProduce(p2);
      return addLine({ pid: p2 ? p2.id : null, name: p2 ? p2.name : 'Article ' + rayon(h.rayon).name, code, pu: h.cents, unit: 'piece', note: `Rayon ${h.rayon} · étiquette maison` });
    }
    oups(code);
  }

  /* La douchette tape le code comme un clavier, puis « Entrée ». */
  function onScan(code) {
    blinkScanner();
    const m = S.modal;
    if (m && m.type === 'oups') { S.modal = null; }
    else if (m && m.type === 'callMael') {
      const h = EAN.parseHouse(code), s = h && h.kind === 'badge' && db.staff.find(x => x.badge === h.num && x.manager);
      if (s) return maelOk(m);
      return toast('Badge de Maël attendu', true);
    } else if (m && m.type === 'product') {
      const f = $('f-ean'); if (f) f.value = code; return;
    } else if (m) { return toast("Ferme d'abord la fenêtre", true); }

    switch (S.screen) {
      case 'login': {
        const h = EAN.parseHouse(code), s = h && h.kind === 'badge' && db.staff.find(x => x.badge === h.num);
        if (s) return logIn(s);
        SOUND.oups(); return toast('Scanne ton badge ou tape ton code', true);
      }
      case 'main': return handleCode(code);
      case 'done': S.done = null; S.screen = 'main'; return handleCode(code);
      case 'produce': S.screen = 'main'; return handleCode(code);
      case 'pay': case 'cash': {
        const h = EAN.parseHouse(code);
        if (h && h.kind === 'copains') return attachCard(h.num);
        SOUND.oups(); return toast("On paie d'abord !", true);
      }
      case 'catalog': {
        const p = db.products.find(x => x.ean === code);
        return openProductEditor(p ? p.id : null, p ? null : code);
      }
      default: return toast('Retourne à la caisse pour scanner', true);
    }
  }

  /* ——— Clavier physique et douchette ——— */
  let buf = [], bufTimer = 0;
  function flushBuf() {
    clearTimeout(bufTimer);
    const keys = buf.map(x => x.k); buf = [];
    keys.forEach(k => pressKey(k));
  }
  document.addEventListener('keydown', e => {
    const t = e.target;
    if (t && t.matches && t.matches('input, select, textarea')) {
      if (e.key === 'Enter') { e.preventDefault(); }
      if (e.key === 'Escape') { t.blur(); }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (/^\d$/.test(k)) {
      e.preventDefault();
      buf.push({ k, t: performance.now() });
      clearTimeout(bufTimer); bufTimer = setTimeout(flushBuf, 70);
      return;
    }
    if (k === 'Enter') {
      e.preventDefault();
      if (buf.length) {
        const fast = buf.length >= 6 && (buf[buf.length - 1].t - buf[0].t) / (buf.length - 1) < 40;
        if (fast) { clearTimeout(bufTimer); const code = buf.map(x => x.k).join(''); buf = []; onScan(code); return; }
        flushBuf();
      }
      pressKey('OK');
      return;
    }
    const map = { Backspace: '⌫', Delete: 'C', '*': '×', x: '×', X: '×', ',': ',', '.': ',' };
    if (k === 'Escape') { e.preventDefault(); flushBuf(); return escape(); }
    if (map[k]) { e.preventDefault(); flushBuf(); pressKey(map[k]); }
  });

  function escape() {
    if (S.modal) { S.modal = null; render(); return; }
    const back = { pay: 'main', cash: 'pay', produce: 'main', catalog: 'manager', label: 'manager', settings: 'manager' };
    if (back[S.screen]) { S.screen = back[S.screen]; render(); }
    else if (S.screen === 'main') { S.saisie = ''; S.mult = null; render(); }
  }

  function pressKey(k) {
    const m = S.modal;
    if (m) {
      if (m.type === 'oups') { if (k === 'OK' || k === 'C') { S.modal = null; render(); } return; }
      if (m.type === 'manual' || m.type === 'cardpay') return padEntry(m, k, 7);
      if (m.type === 'callMael') return pinKey(m, k, pinsManager());
      if (m.type === 'confirm' && k === 'OK') return A.confirmYes();
      return;
    }
    if (S.screen === 'main') return keyMain(k);
    if (S.screen === 'login') return keyLogin(k);
    if (S.screen === 'produce') return keyProduce(k);
    if (S.screen === 'cash' && (k === '⌫' || k === 'C')) { S.cash.received = 0; render(); }
    if (S.screen === 'cash' && k === 'OK') A.cashValidate();
    if (S.screen === 'done' && k === 'OK') A.nextClient();
  }

  /* ——— Pavé de la caisse principale ——— */
  function keyMain(k) {
    if (/^\d+$/.test(k)) {
      if (S.saisie.length < 13) S.saisie += k;
      if (S.saisie.length > 13) S.saisie = S.saisie.slice(0, 13);
    } else if (k === ',') {
      if (!S.saisie.includes(',')) S.saisie = (S.saisie || '0') + ',';
    } else if (k === '×') {
      const n = Number(S.saisie);
      if (/^\d{1,3}$/.test(S.saisie) && n > 0) { S.mult = n; S.saisie = ''; }
      else { toast("Tape d'abord le nombre, puis ×", true); return; }
    } else if (k === 'C') {
      S.saisie = ''; S.mult = null;
    } else if (k === '⌫') {
      if (S.saisie) S.saisie = S.saisie.slice(0, -1); else S.mult = null;
    } else if (k === 'OK') {
      if (/^\d+$/.test(S.saisie) && [8, 12, 13].includes(S.saisie.length)) {
        const c = S.saisie; S.saisie = ''; blinkScanner(); handleCode(c); return;
      }
      if (S.mult != null && !S.saisie) {
        const l = selLine();
        if (l && !l.cancelled && l.unit === 'piece') {
          l.qty = S.mult; l.note = `${S.mult} × saisi au pavé`; S.mult = null; save(); render(); SOUND.bip(); lineFlash(l); return;
        }
        toast('Scanne l’article à multiplier', true); return;
      }
      if (S.saisie) { SOUND.oups(); toast('Tape les 13 chiffres du code', true); return; }
    }
    render();
  }

  /* Saisie d'un montant au pavé : les chiffres arrivent par la droite (150 → 1,50 €). */
  function padEntry(m, k, max) {
    if (/^\d+$/.test(k)) { m.entry = (m.entry + k).replace(/^0+/, '').slice(0, max); }
    else if (k === '⌫') m.entry = m.entry.slice(0, -1);
    else if (k === 'C') m.entry = '';
    else if (k === 'OK') return m.type === 'manual' ? A.manualOk() : A.cardOk();
    else return;
    render();
  }

  /* ——— Connexion ——— */
  const pinsManager = () => db.staff.filter(s => s.manager);
  const pinLen = people => Math.max(4, ...people.map(p => p.pin.length));
  function pinKey(m, k, people) {
    const len = pinLen(people);
    if (/^\d$/.test(k)) { if (m.pin.length < len) m.pin += k; }
    else if (k === '⌫') m.pin = m.pin.slice(0, -1);
    else if (k === 'C') m.pin = '';
    else if (k !== 'OK') return;
    if (m.pin.length === len || (k === 'OK' && m.pin)) {
      const s = people.find(p => p.pin === m.pin);
      m.pin = '';
      if (s) return m.type === 'callMael' ? maelOk(m) : logIn(s);
      m.shake = true; SOUND.oups(); render(); m.shake = false;
      return;
    }
    render();
  }
  function keyLogin(k) {
    if (!S.login.who) { if (/^\d$/.test(k)) toast('Choisis ton nom', true); return; }
    const s = db.staff.find(x => x.id === S.login.who);
    pinKey(S.login, k, s ? [s] : []);
  }
  function logIn(s) {
    db.user = s.id;
    if (db.day.date !== DATA.today() && !db.day.sales.length) db.day = DATA.freshDay(db.settings.fond);
    S.login = { who: null, pin: '', shake: false };
    S.screen = 'main'; S.modal = null;
    save();
    SOUND.copain();
    render();
    toast(`Bonjour ${s.name} !`);
    if (db.day.date !== DATA.today() && db.day.sales.length) setTimeout(() => toast('Pense à la clôture d’hier', true), 2000);
  }
  /* Actions réservées au responsable : si Marin est à la caisse, Maël tape son code. */
  function needMael(reason, then) {
    const u = user();
    if (u && u.manager) return then();
    SOUND.ding();
    S.modal = { type: 'callMael', pin: '', reason, then };
    render();
  }
  function maelOk(m) {
    S.modal = null;
    if (!m.then) return enterManager();
    SOUND.copain();
    m.then();
    render();
  }
  function enterManager() { S.screen = 'manager'; S.modal = null; SOUND.copain(); render(); }

  /* ——— F · Sans code-barres ——— */
  function openProduce(p) {
    S.produce = { rayon: p ? p.rayon : S.produce.rayon || 1, pid: p ? p.id : null, entry: '', qty: S.mult || 1 };
    S.screen = 'produce'; S.modal = null;
    if (p && p.unit === 'kg') SOUND.bip();
    render();
  }
  function keyProduce(k) {
    const pr = S.produce, p = db.products.find(x => x.id === pr.pid);
    if (!p) return;
    if (p.unit === 'kg') {
      if (/^\d+$/.test(k)) pr.entry = (pr.entry + k).replace(/^0+/, '').slice(0, 5);
      else if (k === '⌫') pr.entry = pr.entry.slice(0, -1);
      else if (k === 'C') pr.entry = '';
      else if (k === 'OK') return A.produceAdd();
    } else {
      if (/^\d$/.test(k)) { pr.qty = Math.max(1, Math.min(99, (pr.typed ? pr.qty * 10 : 0) + Number(k))); pr.typed = true; }
      else if (k === '⌫' || k === 'C') { pr.qty = 1; pr.typed = false; }
      else if (k === 'OK') return A.produceAdd();
    }
    render();
  }

  /* ——— Fin du ticket ——— */
  function finish() {
    const t = cur(), tt = totals(t), u = user();
    t.closed = Date.now();
    t.cashier = u ? u.name : '';
    t.caisse = db.settings.caisse;
    t.stampsAdded = 0; t.surprise = false;
    if (t.card != null && db.cards[t.card]) {
      const c = db.cards[t.card];
      if (tt.total > 0) {
        t.stampsAdded = Math.floor(tt.total / 100);
        c.stamps += t.stampsAdded;
        while (c.stamps >= 10) { c.stamps -= 10; c.surprises = (c.surprises || 0) + 1; t.surprise = true; }
      }
      t.cardInfo = { num: c.num, name: c.name, stamps: c.stamps };
    }
    const sum = type => t.payments.filter(p => p.type === type).reduce((s, p) => s + p.amount, 0);
    db.day.sales.push({ no: t.no, at: t.closed, total: tt.total, items: tt.items, disc: tt.disc, cancelled: tt.cancelled, cash: sum('especes'), card: sum('carte'), cashier: t.cashier });
    db.history = [t].concat(db.history || []).slice(0, 30);
    db.current = null;
    S.done = t; S.sel = -1; S.saisie = ''; S.mult = null;
    S.screen = 'done'; S.modal = null;
    clearTimeout(toastTimer); $('toast').className = '';
    save();
    SOUND.ding();
    render();
  }

  /* ——— Impression (imprimante à étiquettes, rouleau 62 mm) ——— */
  function printHTML(html, size) {
    const area = $('print-area');
    area.innerHTML = html;
    let pageSize = size;
    if (!pageSize) {
      area.style.cssText = 'display:block;position:fixed;left:-9999px;top:0;width:62mm';
      const mm = Math.ceil(area.offsetHeight / (96 / 25.4)) + 4;
      area.style.cssText = '';
      pageSize = `62mm ${Math.max(60, mm)}mm`;
    }
    $('page-size').textContent = `@page { size: ${pageSize}; margin: 0; }`;
    SOUND.imprime();
    setTimeout(() => window.print(), 80);
  }

  function receiptHTML(t) {
    const tt = totals(t), rows = [];
    const r = (a, b, cls) => rows.push(`<div class="r-row ${cls || ''}"><span>${a}</span><span>${b}</span></div>`);
    t.lines.forEach(l => {
      if (l.cancelled) { r(esc(l.name), eur(lineBase(l)), 'r-cancel'); rows.push('<div class="r-detail">ligne annulée</div>'); return; }
      r((l.ret ? 'Retour · ' : '') + esc(l.name), eur(lineTotal(l)));
      if (l.unit === 'kg') rows.push(`<div class="r-detail">${kg(l.qty)} kg × ${eur(l.pu)}/kg</div>`);
      else if (l.qty > 1) rows.push(`<div class="r-detail">${l.qty} × ${eur(l.pu)}</div>`);
      if (lineDisc(l)) rows.push(`<div class="r-detail">${esc(l.discNote || 'Remise')} −${num(lineDisc(l))}</div>`);
    });
    const pay = [];
    t.payments.forEach(p => {
      if (p.type === 'carte') pay.push(`<div class="r-row"><span>Carte</span><span>${eur(p.amount)}</span></div>`);
      else pay.push(`<div class="r-row"><span>${p.amount < 0 ? 'Remboursé' : 'Espèces'}</span><span>${eur(p.amount < 0 ? -p.amount : p.received)}</span></div>`);
    });
    const change = t.payments.reduce((s, p) => s + (p.change || 0), 0);
    if (change) pay.push(`<div class="r-row"><span>Rendu</span><span>${eur(change)}</span></div>`);
    const card = t.cardInfo ? `<hr><div class="r-row r-small"><span>Carte Copains n° ${pad4(t.cardInfo.num)}</span><span>+${t.stampsAdded} tampon${t.stampsAdded > 1 ? 's' : ''}</span></div>
      <div class="r-row r-small"><span>${esc(t.cardInfo.name)}</span><span>${t.cardInfo.stamps}/10</span></div>${t.surprise ? '<div class="r-row r-small"><span>Bravo : une surprise !</span><span>★</span></div>' : ''}` : '';
    return `<div class="receipt">
      <div class="r-head"><div class="r-logo"><i></i><i></i></div><div class="r-title">Inter-Marin<br>-et-Maël</div><span class="r-sub">le supermarché de la famille</span></div>
      <hr><div class="r-row r-small"><span>${ddmmyyyy(t.closed)} · ${hhmm(t.closed)}</span><span>${esc(t.caisse || db.settings.caisse)} · ${esc(t.cashier || '')}</span></div>
      <div class="r-row r-small"><span>Ticket n° ${pad4(t.no)}</span><span>${tt.items} article${tt.items > 1 ? 's' : ''}</span></div>
      <hr>${rows.join('')}<hr>
      ${tt.disc ? `<div class="r-row"><span>Remises</span><span>−${num(tt.disc)}</span></div>` : ''}
      ${tt.tdisc ? `<div class="r-row r-small"><span>${esc(t.tdiscNote || 'Remise ticket')}</span><span>−${num(tt.tdisc)}</span></div>` : ''}
      <div class="r-row r-total"><span>TOTAL</span><span>${eur(tt.total)}</span></div>
      ${pay.join('')}${card}
      <div class="r-mot">${esc(DATA.petitMot(t.closed))}</div>
    </div>`;
  }

  function zData() {
    const s = db.day.sales, sum = k => s.reduce((a, x) => a + x[k], 0);
    return { tickets: s.length, items: sum('items'), cash: sum('cash'), card: sum('card'), disc: sum('disc'), cancelled: sum('cancelled'), total: sum('total'), voided: db.day.voided, drawer: db.day.drawer, fond: db.day.fond };
  }
  function zRows(z) {
    return [['Tickets', z.tickets], ['Articles', z.items], ['Espèces', eur(z.cash)], ['Carte', eur(z.card)], ['Remises', z.disc ? '−' + eur(z.disc) : eur(0)], ['Lignes annulées', z.cancelled], ['Tickets annulés', z.voided], ['Fond de caisse', eur(z.fond)], ['Tiroir attendu', eur(z.fond + z.cash)]];
  }
  function zReceiptHTML(z) {
    return `<div class="receipt">
      <div class="r-head"><div class="r-logo"><i></i><i></i></div><div class="r-title">Inter-Marin<br>-et-Maël</div><span class="r-sub">Clôture du jour</span></div>
      <hr><div class="r-row r-small"><span>Journée du ${esc(db.day.date.split('-').reverse().join('/'))}</span><span>${esc(db.settings.caisse)}</span></div>
      <div class="r-row r-small"><span>Imprimé ${ddmmyyyy()} · ${hhmm()}</span><span>${esc((user() || {}).name || '')}</span></div><hr>
      ${zRows(z).map(([k, v]) => `<div class="r-row"><span>${k}</span><span>${v}</span></div>`).join('')}
      <hr><div class="r-row r-total"><span>TOTAL</span><span>${eur(z.total)}</span></div>
      <div class="r-mot">Bravo l’équipe !</div></div>`;
  }

  /* ——— Étiquettes ——— */
  function productCode(p) { return p.ean || EAN.house(p.rayon, p.ppp, p.price); }
  function labelHTML(kind, data) {
    if (kind === 'shelf') {
      const r = rayon(data);
      return `<div class="label shelf"><div class="lb-ring">${picto(r.n, 34, 2.4)}</div><div style="display:flex;flex-direction:column;gap:3px"><span class="lb-name">${esc(r.name)}</span><span class="mono">Rayon ${r.n}</span></div></div>`;
    }
    if (kind === 'card' || kind === 'badge') {
      const code = kind === 'card' ? EAN.copains(data.num) : EAN.badge(data.badge);
      const title = kind === 'card' ? 'Carte Copains' : 'Badge ' + esc(data.role.toLowerCase());
      const who = kind === 'card' ? `${esc(data.name)} · n° ${pad4(data.num)}` : esc(data.name);
      return `<div class="label card"><div class="lb-top"><span class="lb-logo"><i></i><i></i>Inter-Marin-et-Maël</span></div>
        <div style="display:flex;flex-direction:column;gap:0"><span class="lb-name" style="font-size:18px">${title}</span><span class="mono" style="font-size:11px">${who}</span></div>
        <div class="lb-code">${EAN.svg(code)}<span>${EAN.spaced(code)}</span></div></div>`;
    }
    const p = data, code = productCode(p);
    return `<div class="label"><div class="lb-top"><span class="lb-name">${esc(p.name)}</span><span class="lb-price">${eur(p.price)}${p.unit !== 'piece' ? `<span class="lb-unit">${p.unit === 'kg' ? '/kg' : ''}</span>` : ''}</span></div>
      <div class="lb-code">${EAN.svg(code)}<span>${EAN.spaced(code)}</span></div></div>`;
  }

  /* ——— Écrans ——— */
  function topbar() {
    const u = user(), t = cur();
    return `<div class="topbar"><span class="logo on-dark"><i></i><i></i></span><strong>${esc(db.settings.caisse)}</strong>
      <button class="user" data-a="logout">${u && u.manager ? 'Responsable' : 'Caissier'} : ${esc(u ? u.name : '—')}</button>
      <span class="dim">Ticket n° ${pad4(t.no)}</span>
      <span class="spacer"></span><span class="status" id="st-scan">Douchette</span><span class="status">Imprimante</span><span class="clock" id="clock">${hhmm()}</span></div>`;
  }

  const SCREENS = {
    login() {
      const L = S.login, who = db.staff.find(s => s.id === L.who);
      return `<div class="login">
        <div class="login-left">
          <div class="login-brand"><span class="logo"><i></i><i></i></span><b>Inter-Marin-et-Maël<small>le supermarché de la famille</small></b></div>
          <h1>Ouvrir la caisse</h1>
          <div class="people">${db.staff.map(s => `<button class="person ${L.who === s.id ? 'on' : ''}" style="${L.who === s.id ? `background:${s.color}` : ''}" data-a="pickUser" data-v="${s.id}">
            <span class="avatar" style="background:${s.color}">${esc(s.name[0])}</span>${esc(s.name)}<small>${esc(s.role)}</small></button>`).join('')}</div>
          <span class="login-foot">Fond de caisse : ${eur(db.settings.fond)} · ou scanner son badge</span>
          <button class="btn btn-sm btn-white" data-a="fullscreen">Plein écran</button>
        </div>
        <div class="login-right">
          <div class="who">${who ? `Code secret de ${esc(who.name)}` : 'Choisis ton nom'}</div>
          <div class="dots ${L.shake ? 'shake' : ''}">${Array.from({ length: who ? who.pin.length : 4 }, (_, i) => i).map(i => `<i class="${i < L.pin.length ? 'full' : ''}"></i>`).join('')}</div>
          <div class="pinpad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'OK'].map(k => `<button class="key ${k === 'C' ? 'k-c' : k === 'OK' ? 'k-ok' : ''}" data-a="loginKey" data-v="${k}" ${who ? '' : 'disabled'}>${k}</button>`).join('')}</div>
        </div></div>`;
    },

    main() {
      const t = cur(), tt = totals(t), u = user();
      const rows = t.lines.map((l, i) => {
        const note = l.cancelled ? 'Ligne annulée' : l.ret ? 'Retour' : lineDisc(l) ? `${l.discNote || 'Remise'} −${num(lineDisc(l))}` : l.note;
        const qty = l.unit === 'kg' ? kg(l.qty) : l.qty;
        const total = l.cancelled ? num(lineBase(l)) : num(lineTotal(l));
        return `<button class="line cols ${i === S.sel ? 'sel' : ''} ${l.cancelled ? 'cancel' : ''} ${l.ret ? 'ret' : ''}" data-a="selLine" data-v="${i}">
          <span class="l-n">${two(i + 1)}</span><span class="l-name"><b>${esc(l.name)}</b><small>${esc(note)}</small></span>
          <span class="mono">${qty}</span><span class="mono">${num(l.pu)}</span><span class="mono l-total">${total}</span></button>`;
      }).join('');
      const empty = `<div class="lines-empty"><span class="logo"><i></i><i></i></span><strong>Bonjour ${esc(u ? u.name : '')} !</strong><span>Scanne le premier article,<br>ou « Sans code » pour les fruits.</span></div>`;
      const looksCode = /^\d{6,}$/.test(S.saisie);
      const saisieTxt = (S.mult != null ? S.mult + ' ×' : '') + (S.saisie ? (S.mult != null ? ' ' : '') + S.saisie : '');
      const keys = ['7', '8', '9', '×', '4', '5', '6', 'C', '1', '2', '3', '⌫', '0', '00', ',', 'OK'];
      const isMgr = u && u.manager;
      const parkLabel = t.lines.length || !db.parked.length ? 'Mettre en attente' : `Reprendre (${db.parked.length})`;
      const fns = [
        ['cancelLine', 'Annuler ligne', ''], ['manual', 'Prix manuel', ''], ['discount', 'Remise', ''], ['produce', 'Sans code', ''],
        ['park', parkLabel, ''], ['callMael', isMgr ? 'Mode responsable' : 'Appeler Maël', isMgr ? 'f-mael' : 'f-oups'], ['pay', 'Payer', 'f-pay']
      ];
      const card = t.card != null && db.cards[t.card];
      return `<div class="pos">${topbar()}
        <div class="lines">
          <div class="lines-head cols"><span>#</span><span>Article</span><span>Qté</span><span>P.U.</span><span>Total</span></div>
          ${t.lines.length ? `<div class="lines-list" id="lines-list">${rows}</div>` : empty}
          <div class="lines-foot">
            ${t.returnNext ? '<button class="retour-flag" data-a="cancelRetour">Retour : scanne l’article ✕</button>' : `<span>${S.sel >= 0 && t.lines[S.sel] ? `Ligne ${S.sel + 1} sélectionnée` : `${t.lines.length} ligne${t.lines.length > 1 ? 's' : ''}`}</span>`}
            <button class="arrow" data-a="selMove" data-v="-1" ${t.lines.length ? '' : 'disabled'}>▲</button><button class="arrow" data-a="selMove" data-v="1" ${t.lines.length ? '' : 'disabled'}>▼</button>
          </div>
        </div>
        <div class="side">
          <div class="total"><div style="display:flex;flex-direction:column;gap:2px"><span class="total-label">À payer · ${tt.items} article${tt.items > 1 ? 's' : ''}</span><span class="total-amount">${eur(tt.total)}</span></div>
            <div class="total-extra">${tt.disc ? `<span class="remise">Remise −${num(tt.disc)} €</span>` : ''}${card ? `<span class="copain">Copain · ${esc(card.name)}</span>` : ''}</div></div>
          <div class="saisie ${saisieTxt ? '' : 'empty'}"><small>${S.mult != null ? 'Quantité' : looksCode ? 'Code' : 'Saisie'}</small><b>${saisieTxt ? esc(saisieTxt) : '—'}</b></div>
          <div class="keypad">${keys.map(k => `<button class="key ${k === 'OK' ? 'k-ok' : k === 'C' ? 'k-c' : '×⌫'.includes(k) ? 'k-dark' : ''}" data-a="key" data-v="${k}">${k}</button>`).join('')}</div>
        </div>
        <div class="fnbar">${fns.map(([a, l, c]) => `<button class="fn ${c}" data-a="${a}">${l}</button>`).join('')}</div>
      </div>`;
    },

    produce() {
      const pr = S.produce;
      const list = db.products.filter(p => p.rayon === pr.rayon && (!p.ean || p.unit === 'kg' || p.id === pr.pid));
      const p = db.products.find(x => x.id === pr.pid);
      let side = '<div class="hint" style="margin-top:20px">Touche un produit.</div>';
      if (p) {
        if (p.unit === 'kg') {
          const g = Number(pr.entry || 0);
          side = `<div class="display"><small>Poids</small><b>${kg(g)} kg</b></div>
            <div class="mini-pad">${['7', '8', '9', '4', '5', '6', '1', '2', '3', 'C', '0', '⌫'].map(k => `<button class="key ${k === 'C' ? 'k-c' : k === '⌫' ? 'k-dark' : ''}" data-a="produceKey" data-v="${k}">${k}</button>`).join('')}</div>
            <div class="sel-total"><span>Prix</span><b>${eur(Math.round(g * p.price / 1000))}</b></div>
            <button class="btn btn-dark" data-a="produceAdd" ${g ? '' : 'disabled'}>Ajouter</button>`;
        } else {
          side = `<div class="hint">Combien ?</div>
            <div class="qty-row"><button class="key k-dark" data-a="produceQty" data-v="-1">−</button><b>${pr.qty}</b><button class="key k-dark" data-a="produceQty" data-v="1">+</button></div>
            <div style="flex:1"></div>
            <div class="sel-total"><span>Prix</span><b>${eur(pr.qty * p.price)}</b></div>
            <button class="btn btn-dark" data-a="produceAdd">Ajouter</button>`;
        }
        side = `<div class="sel-name">${esc(p.name)}</div><div class="sel-price">${eur(p.price)}${DATA.unitLabel(p.unit)}${p.unit === 'kg' ? ' · poids en grammes' : ''}</div>` + side;
      }
      return `<div class="produce">
        <div class="head"><button class="back" data-a="go" data-v="main">← Caisse</button><h1>Sans code-barres · ${esc(rayon(pr.rayon).name)}</h1><span class="right mono hint">Rayon ${pr.rayon}</span></div>
        <div class="rayon-tabs">${RAYONS.map(r => `<button class="rtab ${r.n === pr.rayon ? 'on' : ''}" style="background:${r.bg}" data-a="produceRayon" data-v="${r.n}">${picto(r.n, 24)}${esc(r.name)}</button>`).join('')}</div>
        <div class="prod-grid">${list.length ? list.map(x => `<button class="prod ${x.id === pr.pid ? 'on' : ''}" data-a="producePick" data-v="${x.id}"><b>${esc(x.name)}</b><span>${eur(x.price)}${DATA.unitLabel(x.unit)}</span></button>`).join('') : '<div class="hint">Rien sans code dans ce rayon.</div>'}</div>
        <div class="produce-side">${side}</div></div>`;
    },

    pay() {
      const t = cur(), tt = totals(t), card = t.card != null && db.cards[t.card];
      const paid = t.payments.length ? `<span class="paid">Déjà payé : ${t.payments.map(p => `${p.type === 'carte' ? 'Carte' : 'Espèces'} ${eur(p.amount)}`).join(' · ')}</span>` : '';
      const tiles = tt.remaining < 0
        ? `<div class="pay-tiles" style="grid-template-columns:1fr"><button class="tile" style="background:var(--bip-dark)" data-a="refund"><span class="ic-coin"></span>Je te rends ${eur(-tt.remaining)}</button></div>`
        : `<div class="pay-tiles">
          <button class="tile" style="background:var(--marin)" data-a="payCard"><span class="ic-card"></span>Carte</button>
          <button class="tile" style="background:var(--bip-dark)" data-a="payCash"><span class="ic-coin"></span>Pièces</button>
          <button class="tile" style="background:var(--mael)" data-a="payCash"><span class="ic-note"></span>Billets</button></div>`;
      return `<div class="full">
        <div class="head"><button class="back" data-a="go" data-v="main">← Caisse</button><h1>${tt.remaining < 0 ? 'On rembourse' : 'Comment on paie ?'}</h1><div class="right"><span class="hint">${t.payments.length ? 'Reste' : 'À payer'}</span><span class="amount">${eur(Math.abs(tt.remaining))}</span></div></div>
        ${tiles}
        <div class="pay-foot">${card ? `<span class="pill">Carte Copains · ${esc(card.name)} · ${card.stamps}/10</span>` : '<span>Carte Copains ? Scannez-la maintenant.</span>'}<span style="margin-left:auto">${paid || 'Paiement en plusieurs fois possible : carte + pièces.'}</span></div>
      </div>`;
    },

    cash() {
      const tt = totals(cur()), rem = tt.remaining, rec = S.cash.received;
      const change = rec - rem;
      const D = [[5000, '50 €', 'note'], [2000, '20 €', 'note'], [1000, '10 €', 'note'], [500, '5 €', 'note'], [200, '2 €', 'coin'], [100, '1 €', 'coin'], [50, '50 c', 'coin'], [20, '20 c', 'coin'], [10, '10 c', 'coin']];
      const btn = rec >= rem ? 'Valider · ouvrir tiroir' : rec > 0 ? `Valider · reste ${eur(rem - rec)}` : 'Valider';
      return `<div class="cash">
        <div class="cash-left">
          <div class="head"><button class="back" data-a="go" data-v="pay">← Retour</button><h1>Espèces reçues</h1></div>
          <div class="cash-keys">${D.map(([v, l, c]) => `<button class="key ${c}" data-a="cashAdd" data-v="${v}">${l}</button>`).join('')}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px">
            <button class="btn btn-white" data-a="cashExact">Montant exact</button>
            <button class="btn btn-white" data-a="cashAdd" data-v="5">+5 c</button>
            <button class="btn btn-oups" data-a="cashClear">Effacer</button>
          </div>
          <div class="display"><small>Reçu</small><b>${num(rec)}</b></div>
        </div>
        <div class="cash-right">
          <div class="row"><span>À payer</span><span>${eur(rem)}</span></div>
          <div class="row"><span>Reçu</span><span>${eur(rec)}</span></div>
          <div class="sep"></div>
          ${change >= 0 ? `<span class="rends">Je te rends</span><span class="change">${eur(change)}</span><span class="coins">${change ? coins(change) : 'Compte juste, bravo !'}</span>`
            : `<span class="rends">Il manque</span><span class="change short">${eur(-change)}</span><span class="coins">${rec ? 'Le reste se paie ensuite, par carte ou en espèces.' : 'Touche les billets et les pièces reçus.'}</span>`}
          <button class="btn btn-go" data-a="cashValidate" ${rec > 0 ? '' : 'disabled'}>${btn}</button>
        </div></div>`;
    },

    done() {
      const t = S.done, change = t.payments.reduce((s, p) => s + (p.change || 0), 0);
      const refund = t.payments.filter(p => p.amount < 0).reduce((s, p) => s - p.amount, 0);
      const c = t.cardInfo;
      return `<div class="done">
        <div class="done-ticket">${receiptHTML(t)}</div>
        <div class="done-right">
          <span class="merci">${esc(DATA.petitMot(t.closed))}</span>
          ${change || refund ? `<div class="rendu">Je te rends<b>${eur(change || refund)}</b><span class="coins">${coins(change || refund)}</span></div>` : '<div class="rendu">Ticket n° ' + pad4(t.no) + ' payé.</div>'}
          ${c ? `<div class="copain-box"><span><strong>${esc(c.name)}</strong> · +${t.stampsAdded} tampon${t.stampsAdded > 1 ? 's' : ''}</span>
            <div class="stamps">${Array.from({ length: 10 }, (_, i) => `<i class="${i < c.stamps ? (i % 2 ? 's2' : 's1') : ''}"></i>`).join('')}</div>
            ${t.surprise ? '<span class="surprise">10 tampons : une surprise !</span>' : ''}</div>` : ''}
          <div class="actions"><button class="btn btn-dark" data-a="printTicket">Imprimer le ticket</button><button class="btn btn-go" data-a="nextClient">Client suivant</button></div>
        </div></div>`;
    },

    manager() {
      const z = zData(), t = cur();
      const acts = [
        ['catalog', '€', 'Changer un prix', 'Produits, prix, codes-barres'],
        ['retour', '↩', 'Retour / remboursement', 'Le prochain article est rendu'],
        ['voidTicket', '✕', 'Annuler le ticket', `Ticket n° ${pad4(t.no)} · ${t.lines.length} ligne${t.lines.length > 1 ? 's' : ''}`],
        ['label', '▦', 'Créer une étiquette', 'Prix, rayon, carte Copains'],
        ['drawer', '⇲', 'Ouvrir le tiroir', `Ouvert ${db.day.drawer} fois aujourd’hui`],
        ['reprint', '⎙', 'Réimprimer un ticket', db.history && db.history[0] ? `Dernier : n° ${pad4(db.history[0].no)}` : 'Aucun ticket'],
        ['settings', '⚙', 'Réglages', 'Codes secrets, fond de caisse'],
        ['logout', '⏻', 'Fermer la session', esc((user() || {}).name || '')]
      ];
      return `<div class="manager">
        <div class="manager-left">
          <div class="head"><button class="back" data-a="go" data-v="main">← Caisse</button><h1>Mode responsable</h1><span class="right"><span class="pill" style="background:oklch(0.55 0.17 30 / 0.12);color:var(--mael)">Maël</span></span></div>
          <div class="m-actions">${acts.map(([a, ic, l, s]) => `<button class="m-action" data-a="${a}"><span class="m-ic">${ic}</span><span>${l}<small>${s}</small></span></button>`).join('')}</div>
        </div>
        <div class="z"><h2>Clôture du jour</h2>
          ${[['Tickets', z.tickets], ['Articles', z.items], ['Espèces', eur(z.cash)], ['Carte', eur(z.card)], ['Remises', z.disc ? '−' + eur(z.disc) : eur(0)], ['Lignes annulées', z.cancelled], ['Fond de caisse', eur(z.fond)]].map(([k, v]) => `<div class="row"><span>${k}</span><b>${v}</b></div>`).join('')}
          <div class="row big"><span>Total</span><b>${eur(z.total)}</b></div>
          <button class="btn btn-mael" data-a="closeDay">Imprimer et fermer</button>
        </div></div>`;
    },

    catalog() {
      const list = db.products.filter(p => !S.catRayon || p.rayon === S.catRayon).slice().sort((a, b) => a.rayon - b.rayon || a.name.localeCompare(b.name, 'fr'));
      return `<div class="cat">
        <div class="head"><button class="back" data-a="go" data-v="manager">← Retour</button><h1>Produits &amp; prix</h1><div class="right"><span class="hint">Scanne un produit pour le retrouver ou l’ajouter</span><button class="btn btn-sm btn-dark" data-a="newProduct">+ Nouveau</button></div></div>
        <div class="rayon-tabs" style="grid-template-columns:repeat(9,minmax(0,1fr))">
          <button class="rtab ${!S.catRayon ? 'on' : ''}" style="background:#fff" data-a="catRayon" data-v="0"><b style="font-size:18px">∗</b>Tous</button>
          ${RAYONS.map(r => `<button class="rtab ${r.n === S.catRayon ? 'on' : ''}" style="background:${r.bg}" data-a="catRayon" data-v="${r.n}">${picto(r.n, 22)}${esc(r.name)}</button>`).join('')}</div>
        <div class="cat-list">${list.map(p => `<button class="cat-row" data-a="editProduct" data-v="${p.id}">
          <span class="rdot" style="background:${rayon(p.rayon).bg}">${picto(p.rayon, 18)}</span>
          <span><b>${esc(p.name)}</b></span>
          <span class="mono">${p.ean ? EAN.spaced(p.ean) : 'maison · ' + EAN.spaced(productCode(p))}</span>
          <span class="price">${eur(p.price)}${p.unit === 'kg' ? '/kg' : ''}</span></button>`).join('')}</div>
      </div>`;
    },

    label() {
      const L = S.label;
      let left = '', preview = '';
      if (L.tab === 'produit') {
        const list = db.products.filter(p => p.rayon === L.rayon);
        const p = db.products.find(x => x.id === L.pid) || list[0];
        if (p) L.pid = p.id;
        left = `<div class="seg" style="display:grid;grid-template-columns:repeat(8,1fr)">${RAYONS.map(r => `<button style="justify-content:center;padding:0" class="${r.n === L.rayon ? 'on' : ''}" data-a="labRayon" data-v="${r.n}" title="${esc(r.name)}">${picto(r.n, 20)}</button>`).join('')}</div>
          <div class="lab-list">${list.map(x => `<button class="choice ${p && x.id === p.id ? 'on' : ''}" data-a="labPick" data-v="${x.id}">${esc(x.name)}</button>`).join('')}</div>`;
        preview = p ? labelHTML('product', p) : '';
      } else if (L.tab === 'rayon') {
        left = `<div class="lab-list">${RAYONS.map(r => `<button class="choice ${r.n === L.shelf ? 'on' : ''}" style="background:${r.bg}" data-a="labShelf" data-v="${r.n}">${picto(r.n, 22)} ${esc(r.name)}</button>`).join('')}</div>`;
        preview = labelHTML('shelf', L.shelf);
      } else {
        const cards = Object.values(db.cards).sort((a, b) => a.num - b.num);
        if (!db.cards[L.card] && cards[0]) L.card = cards[0].num;
        left = `<div class="lab-list">${cards.map(c => `<button class="choice ${c.num === L.card ? 'on' : ''}" data-a="labCard" data-v="${c.num}">${esc(c.name)}<span class="mono" style="font-size:12px">${pad4(c.num)}</span></button>`).join('')}
          <button class="choice" style="border-style:dashed" data-a="newCard">+ Nouvelle carte</button></div>`;
        preview = db.cards[L.card] ? labelHTML('card', db.cards[L.card]) : '';
      }
      const tabs = [['produit', 'Prix + code'], ['rayon', 'Rayon'], ['carte', 'Carte Copains']];
      return `<div class="lab">
        <div class="head"><button class="back" data-a="go" data-v="manager">← Retour</button><h1>Créer une étiquette</h1><div class="right seg">${tabs.map(([k, l]) => `<button class="${L.tab === k ? 'on' : ''}" data-a="labTab" data-v="${k}">${l}</button>`).join('')}</div></div>
        <div class="lab-left">${left}</div>
        <div class="lab-right">${preview}
          <span class="hint">Étiquette 62 × 29 mm · imprimante de Maël</span>
          <div class="copies">Exemplaires<button class="key" data-a="labCopies" data-v="-1">−</button><b>${L.copies}</b><button class="key" data-a="labCopies" data-v="1">+</button></div>
          <button class="btn btn-dark" data-a="labPrint" ${preview ? '' : 'disabled'}>Imprimer</button>
        </div></div>`;
    },

    settings() {
      return `<div class="settings">
        <div class="head"><button class="back" data-a="go" data-v="manager">← Retour</button><h1>Réglages</h1><div class="right"><button class="btn btn-sm btn-go" data-a="saveSettings">Enregistrer</button></div></div>
        <div class="grid">
          <div class="card-box"><h3>Codes secrets &amp; badges</h3>
            ${db.staff.map(s => `<div class="row"><span class="avatar" style="width:30px;height:30px;border-radius:50%;background:${s.color};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800">${esc(s.name[0])}</span>
              <span class="grow"><b>${esc(s.name)}</b> · ${esc(s.role)}</span>
              <input class="field mono" id="pin-${s.id}" value="${esc(s.pin)}" maxlength="6" inputmode="numeric" aria-label="Code de ${esc(s.name)}">
              <button class="btn btn-sm btn-white" data-a="printBadge" data-v="${s.id}">Badge</button></div>`).join('')}
            <span class="hint">4 à 6 chiffres. Le badge s’imprime sur l’imprimante à étiquettes et se scanne à la connexion.</span>
          </div>
          <div class="card-box"><h3>Caisse</h3>
            <div class="row"><span class="grow">Nom de la caisse</span><input class="field" style="width:170px" id="set-caisse" value="${esc(db.settings.caisse)}"></div>
            <div class="row"><span class="grow">Fond de caisse</span><input class="field mono" id="set-fond" value="${num(db.settings.fond)}" inputmode="decimal"></div>
            <span class="hint">La caisse s’enregistre toute seule dans ce navigateur.</span>
            <div style="flex:1"></div>
            <button class="btn btn-oups" data-a="resetAll">Tout effacer et recommencer</button>
          </div>
        </div></div>`;
    }
  };

  /* ——— Fenêtres ——— */
  const miniPad = action => `<div class="mini-pad">${['7', '8', '9', '4', '5', '6', '1', '2', '3', '00', '0', '⌫'].map(k => `<button class="key ${k === '⌫' ? 'k-dark' : ''}" data-a="${action}" data-v="${k}">${k}</button>`).join('')}</div>`;
  const MODALS = {
    oups(m) {
      return `<div class="oups"><span class="o-big">Oups !</span><span class="o-msg">${esc(m.msg)}</span>${m.code ? `<span class="o-code">${esc(m.code)}</span>` : ''}
        <div class="actions"><button class="btn btn-dark" data-a="closeModal">Re-scanner</button><button class="btn btn-line" data-a="manual" data-v="${esc(m.code || '')}">Prix manuel</button><button class="btn btn-line" data-a="callMael">Appeler Maël</button></div></div>`;
    },
    manual(m) {
      return `<div class="modal" style="width:680px"><div class="head"><h2>Prix manuel</h2><span class="right hint">${m.code ? 'Code ' + esc(m.code) : 'Article sans prix'}</span></div>
        <div style="display:grid;grid-template-columns:1fr 250px;gap:14px">
          <div class="choice-grid" style="grid-template-columns:repeat(2,1fr)">${RAYONS.map(r => `<button class="choice ${m.rayon === r.n ? 'on' : ''}" data-a="manualRayon" data-v="${r.n}">${picto(r.n, 22)}${esc(r.name)}</button>`).join('')}</div>
          <div style="display:flex;flex-direction:column;gap:8px"><div class="display"><small>${S.mult ? S.mult + ' × ' : ''}Prix</small><b>${eur(Number(m.entry || 0))}</b></div>${miniPad('manualKey')}</div>
        </div>
        <div class="actions"><button class="btn btn-line" data-a="closeModal">Annuler</button><button class="btn btn-go" data-a="manualOk" ${Number(m.entry) > 0 ? '' : 'disabled'}>Ajouter</button></div></div>`;
    },
    discount(m) {
      const t = cur(), l = t.lines[m.line];
      const opts = [['p', 10, '−10 %'], ['p', 20, '−20 %'], ['p', 50, '−50 %'], ['p', 100, 'Gratuit'], ['a', 10, '−0,10 €'], ['a', 20, '−0,20 €'], ['a', 50, '−0,50 €'], ['a', 100, '−1,00 €']];
      return `<div class="modal" style="width:560px"><h2>Remise</h2>
        <div class="seg">${l ? `<button class="${m.target === 'line' ? 'on' : ''}" data-a="discTarget" data-v="line">Ligne : ${esc(l.name)}</button>` : ''}<button class="${m.target === 'ticket' ? 'on' : ''}" data-a="discTarget" data-v="ticket">Tout le ticket</button></div>
        <div class="choice-grid" style="grid-template-columns:repeat(4,1fr)">${opts.map(([k, v, lab]) => `<button class="choice" data-a="discApply" data-v="${k}${v}"><span class="mono">${lab}</span></button>`).join('')}</div>
        <p>${t.card != null ? 'Carte Copains présente : la remise s’appelle « Remise Copains ».' : 'Astuce : scanne la carte Copains avant, la remise portera son nom.'}</p>
        <div class="actions"><button class="btn btn-line" data-a="discApply" data-v="x0">Retirer la remise</button><button class="btn btn-dark" data-a="closeModal">Fermer</button></div></div>`;
    },
    confirm(m) {
      return `<div class="modal" style="width:440px"><h2>${esc(m.title)}</h2>${m.text ? `<p>${esc(m.text)}</p>` : ''}
        <div class="actions"><button class="btn btn-line" data-a="closeModal">Non</button><button class="btn ${m.danger ? 'btn-mael' : 'btn-dark'}" data-a="confirmYes">${esc(m.yes || 'Oui')}</button></div></div>`;
    },
    callMael(m) {
      return `<div class="modal" style="width:520px;background:var(--oups)"><div class="head"><h2>Maël arrive !</h2><span class="right hint" style="color:var(--ink)">Code secret ou badge</span></div>
        <div style="display:grid;grid-template-columns:1fr 230px;gap:16px;align-items:center">
          <div style="display:flex;flex-direction:column;gap:14px;align-items:center"><div class="dots ${m.shake ? 'shake' : ''}">${Array.from({ length: pinLen(pinsManager()) }, (_, i) => i).map(i => `<i class="${i < m.pin.length ? 'full' : ''}"></i>`).join('')}</div><p style="color:var(--ink);text-align:center">Maël tape son code<br>${esc(m.reason || 'pour ouvrir le mode responsable')}.</p></div>
          <div class="mini-pad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map(k => `<button class="key ${k === 'C' ? 'k-dark' : ''}" data-a="maelKey" data-v="${k}">${k}</button>`).join('')}</div>
        </div>
        <div class="actions"><button class="btn btn-dark" data-a="closeModal">Fermer</button></div></div>`;
    },
    cardpay(m) {
      const rem = totals(cur()).remaining;
      return `<div class="modal" style="width:520px"><div class="head"><h2>Carte</h2><span class="right hint">Reste ${eur(rem)}</span></div>
        <div style="display:grid;grid-template-columns:1fr 230px;gap:16px">
          <div style="display:flex;flex-direction:column;gap:10px"><div class="display"><small>Montant</small><b>${eur(Number(m.entry || 0))}</b></div>
            <button class="btn btn-white" data-a="cardAll">Tout : ${eur(rem)}</button>
            <p>Passe la carte dans le lecteur, puis touche « Carte acceptée ».</p></div>
          ${miniPad('cardKey')}
        </div>
        <div class="actions"><button class="btn btn-line" data-a="closeModal">Annuler</button><button class="btn btn-go" data-a="cardOk" ${Number(m.entry) > 0 ? '' : 'disabled'}>Carte acceptée</button></div></div>`;
    },
    parked() {
      return `<div class="modal" style="width:480px"><h2>Tickets en attente</h2>
        <div class="choice-grid">${db.parked.map((t, i) => { const tt = totals(t); return `<button class="choice" style="justify-content:space-between" data-a="resume" data-v="${i}"><span>Ticket n° ${pad4(t.no)} · ${tt.items} article${tt.items > 1 ? 's' : ''}</span><span class="mono">${eur(tt.total)}</span></button>`; }).join('')}</div>
        <div class="actions"><button class="btn btn-dark" data-a="closeModal">Fermer</button></div></div>`;
    },
    product(m) {
      const p = m.id ? db.products.find(x => x.id === m.id) : { name: '', price: 0, unit: 'piece', rayon: S.catRayon || 1, ean: m.ean || '' };
      return `<div class="modal"><div class="head"><h2>${m.id ? 'Modifier le produit' : 'Nouveau produit'}</h2></div>
        <div class="form">
          <label for="f-name">Nom</label><input class="field" id="f-name" value="${esc(p.name)}" maxlength="40" autocomplete="off">
          <label for="f-price">Prix</label><input class="field mono" id="f-price" value="${p.price ? num(p.price) : ''}" placeholder="1,05" inputmode="decimal" autocomplete="off">
          <label for="f-unit">Vendu</label><select class="field" id="f-unit">${[['piece', 'à la pièce'], ['kg', 'au kilo'], ['barq', 'à la barquette']].map(([v, l]) => `<option value="${v}" ${p.unit === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <label for="f-rayon">Rayon</label><select class="field" id="f-rayon">${RAYONS.map(r => `<option value="${r.n}" ${p.rayon === r.n ? 'selected' : ''}>${r.n} · ${esc(r.name)}</option>`).join('')}</select>
          <label for="f-ean">Code-barres</label><input class="field mono" id="f-ean" value="${esc(p.ean || '')}" placeholder="vide = étiquette maison" inputmode="numeric" maxlength="13" autocomplete="off">
        </div>
        <span class="hint" id="f-err" style="color:var(--mael);min-height:18px"></span>
        <div class="actions">${m.id ? '<button class="btn btn-line" style="margin-right:auto" data-a="deleteProduct">Supprimer</button>' : ''}<button class="btn btn-line" data-a="closeModal">Annuler</button><button class="btn btn-go" data-a="saveProduct">Enregistrer</button></div></div>`;
    },
    newcard() {
      return `<div class="modal" style="width:460px"><h2>Nouvelle carte Copains</h2>
        <div class="form" style="width:auto;grid-template-columns:90px 1fr"><label for="f-cname">Prénom</label><input class="field" id="f-cname" maxlength="24" placeholder="Mamie Jo" autocomplete="off"></div>
        <p>Numéro attribué : <span class="mono">${pad4(db.nextCard)}</span></p>
        <div class="actions"><button class="btn btn-line" data-a="closeModal">Annuler</button><button class="btn btn-go" data-a="saveCard">Créer</button></div></div>`;
    }
  };

  /* ——— Rendu ——— */
  function render() {
    if (S.screen !== 'login' && !user()) S.screen = 'login';
    $screen.innerHTML = SCREENS[S.screen]();
    const hadFocus = S.modal && (S.modal.type === 'product' || S.modal.type === 'newcard');
    $modal.innerHTML = S.modal ? MODALS[S.modal.type](S.modal) : '';
    if (hadFocus && !S.modal.focused) { S.modal.focused = true; const f = $modal.querySelector('input'); if (f) setTimeout(() => f.focus(), 30); }
    const sel = $screen.querySelector('.line.sel');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
    else { const list = $('lines-list'); if (list) list.scrollTop = list.scrollHeight; }
  }

  /* ——— Actions (boutons) ——— */
  const A = {
    go(v) { S.screen = v; S.modal = null; render(); },
    closeModal() { S.modal = null; render(); },
    fullscreen() { const d = document.documentElement; (d.requestFullscreen || d.webkitRequestFullscreen || (() => {})).call(d); },

    pickUser(v) { S.login = { who: v, pin: '', shake: false }; render(); },
    loginKey(v) { keyLogin(v); },
    logout() {
      S.modal = { type: 'confirm', title: 'Fermer la session ?', text: 'Le ticket en cours reste gardé pour la prochaine fois.', yes: 'Fermer', onYes: () => { db.user = null; save(); S.screen = 'login'; } };
      render();
    },
    confirmYes() { const m = S.modal; S.modal = null; if (m && m.onYes) m.onYes(); render(); },

    key(v) { keyMain(v); },
    selLine(v) { S.sel = Number(v); render(); },
    selMove(v) {
      const n = cur().lines.length; if (!n) return;
      S.sel = S.sel < 0 ? (Number(v) < 0 ? n - 1 : 0) : Math.max(0, Math.min(n - 1, S.sel + Number(v)));
      render();
    },
    cancelLine() {
      const l = selLine();
      if (!l) return toast('Touche d’abord une ligne', true);
      if (l.cancelled) return toast('Ligne déjà annulée', true);
      needMael('pour annuler la ligne', () => {
        S.modal = { type: 'confirm', title: 'Annuler cette ligne ?', text: `${l.name} — elle restera barrée sur le ticket.`, yes: 'Annuler la ligne', danger: true, onYes: () => { l.cancelled = true; save(); toast('Ligne annulée'); } };
        render();
      });
    },
    cancelRetour() { cur().returnNext = false; save(); render(); },

    manual(v) { needMael('pour un prix manuel', () => A.manualOpen(v)); },
    manualOpen(v) {
      const entry = S.saisie.includes(',') ? String(DATA.parseEur(S.saisie) || '') : '';
      if (entry) S.saisie = '';
      S.modal = { type: 'manual', rayon: 1, entry: entry === '0' ? '' : entry, code: v || null };
      render();
    },
    manualRayon(v) { S.modal.rayon = Number(v); render(); },
    manualKey(v) { padEntry(S.modal, v, 6); },
    manualOk() {
      const m = S.modal, pu = Number(m.entry || 0);
      if (!pu) return;
      addLine({ name: rayon(m.rayon).name + ' · prix manuel', pu, unit: 'piece', note: m.code ? 'Code ' + m.code.slice(0, 7) + '… · manuel' : 'Prix manuel' });
    },

    discount() {
      const l = selLine();
      S.modal = { type: 'discount', target: l && !l.cancelled ? 'line' : 'ticket', line: l && !l.cancelled ? S.sel : -1 };
      render();
    },
    discTarget(v) { S.modal.target = v; render(); },
    discApply(v) {
      const t = cur(), m = S.modal, kind = v[0], val = Number(v.slice(1));
      const name = t.card != null ? 'Remise Copains' : 'Remise';
      if (m.target === 'line') {
        const l = t.lines[m.line]; if (!l) return;
        const base = lineBase(l);
        l.disc = kind === 'x' ? 0 : Math.min(base, kind === 'p' ? Math.round(base * val / 100) : val);
        l.discNote = kind === 'p' ? (val === 100 ? 'Offert' : `${name} ${val} %`) : name;
      } else {
        const sub = totals(Object.assign({}, t, { tdisc: 0 })).sub;
        t.tdisc = kind === 'x' ? 0 : Math.min(Math.max(0, sub), kind === 'p' ? Math.round(sub * val / 100) : val);
        t.tdiscNote = kind === 'p' ? `${name} ${val} %` : name;
      }
      S.modal = null; save(); render();
      if (kind !== 'x') { SOUND.copain(); toast(`${name} appliquée`); }
    },

    produce() { openProduce(null); },
    produceRayon(v) { S.produce.rayon = Number(v); S.produce.pid = null; S.produce.entry = ''; render(); },
    producePick(v) { S.produce.pid = v; S.produce.entry = ''; S.produce.typed = false; render(); },
    produceKey(v) { keyProduce(v); },
    produceQty(v) { S.produce.qty = Math.max(1, Math.min(99, S.produce.qty + Number(v))); S.produce.typed = true; render(); },
    produceAdd() {
      const pr = S.produce, p = db.products.find(x => x.id === pr.pid);
      if (!p) return;
      if (p.unit === 'kg') {
        const g = Number(pr.entry || 0); if (!g) return toast('Tape le poids en grammes', true);
        S.mult = null;
        addLine({ pid: p.id, name: p.name, pu: p.price, unit: 'kg', qty: g, note: `${kg(g)} kg × ${eur(p.price)}/kg` });
      } else {
        S.mult = null;
        addLine({ pid: p.id, name: p.name, pu: p.price, unit: 'piece', qty: pr.qty, note: `Rayon ${p.rayon} · ${p.unit === 'barq' ? 'barquette' : 'pièce'}` });
      }
    },

    park() {
      const t = cur();
      if (t.lines.length) {
        db.parked.push(t); db.current = null; S.sel = -1; save(); render();
        return toast(`Ticket n° ${pad4(t.no)} en attente`);
      }
      if (db.parked.length) { S.modal = { type: 'parked' }; render(); }
      else toast('Rien à mettre en attente', true);
    },
    resume(v) {
      const t = db.parked.splice(Number(v), 1)[0];
      if (!t) return;
      if (db.current && db.current.lines.length) db.parked.push(db.current);
      db.current = t; S.sel = t.lines.length - 1; S.modal = null; save(); render();
      toast(`Ticket n° ${pad4(t.no)} repris`);
    },

    callMael() {
      const u = user();
      if (u && u.manager) return enterManager();
      SOUND.ding();
      S.modal = { type: 'callMael', pin: '' }; render();
    },
    maelKey(v) { pinKey(S.modal, v, pinsManager()); },

    pay() {
      const t = cur(), tt = totals(t);
      if (!t.lines.some(l => !l.cancelled)) return toast('Le panier est vide', true);
      if (tt.remaining === 0) return finish();
      S.screen = 'pay'; render();
    },
    payCard() { const rem = totals(cur()).remaining; S.modal = { type: 'cardpay', entry: String(rem) }; render(); },
    cardKey(v) { padEntry(S.modal, v, 6); },
    cardAll() { S.modal.entry = String(totals(cur()).remaining); render(); },
    cardOk() {
      const t = cur(), rem = totals(t).remaining, amount = Math.min(Number(S.modal.entry || 0), rem);
      if (amount <= 0) return;
      t.payments.push({ type: 'carte', amount }); save();
      S.modal = null;
      if (amount >= rem) return finish();
      SOUND.bip(); render(); toast(`Carte ${eur(amount)} · reste ${eur(rem - amount)}`);
    },
    payCash() { S.cash = { received: 0 }; S.screen = 'cash'; render(); },
    cashAdd(v) { S.cash.received += Number(v); render(); },
    cashExact() { S.cash.received = totals(cur()).remaining; render(); },
    cashClear() { S.cash.received = 0; render(); },
    cashValidate() {
      const t = cur(), rem = totals(t).remaining, rec = S.cash.received;
      if (rec <= 0) return;
      const applied = Math.min(rec, rem), change = Math.max(0, rec - rem);
      t.payments.push({ type: 'especes', amount: applied, received: rec, change }); save();
      if (applied < rem) { SOUND.ding(); S.screen = 'pay'; render(); return toast(`Reste ${eur(rem - applied)} à payer`); }
      finish();
    },
    refund() {
      const t = cur(), rem = totals(t).remaining;
      t.payments.push({ type: 'especes', amount: rem, received: 0, change: 0 }); save();
      finish();
    },

    printTicket() { if (S.done) printHTML(receiptHTML(S.done)); },
    nextClient() { S.done = null; S.screen = 'main'; render(); },

    /* Mode responsable */
    catalog() { S.screen = 'catalog'; render(); },
    catRayon(v) { S.catRayon = Number(v); render(); },
    retour() { cur().returnNext = true; save(); S.screen = 'main'; render(); toast('Scanne l’article rendu'); },
    voidTicket() {
      const t = cur();
      if (!t.lines.length) return toast('Le ticket est vide', true);
      S.modal = { type: 'confirm', title: `Annuler le ticket n° ${pad4(t.no)} ?`, text: `${t.lines.length} ligne${t.lines.length > 1 ? 's' : ''} seront effacées. Il sera compté dans la clôture.`, yes: 'Annuler le ticket', danger: true,
        onYes: () => { db.day.voided++; db.current = null; S.sel = -1; save(); toast('Ticket annulé'); } };
      render();
    },
    label() { S.screen = 'label'; render(); },
    drawer() { db.day.drawer++; save(); SOUND.ding(); render(); toast('Tiroir ouvert'); },
    reprint() { const t = db.history && db.history[0]; if (!t) return toast('Aucun ticket à réimprimer', true); printHTML(receiptHTML(t)); },
    settings() { S.screen = 'settings'; render(); },
    closeDay() {
      const t = cur();
      S.modal = { type: 'confirm', title: 'Imprimer la clôture et fermer ?',
        text: (t.lines.length ? 'Le ticket en cours sera annulé. ' : '') + 'Les compteurs du jour repartent à zéro.', yes: 'Imprimer et fermer', danger: true,
        onYes: () => {
          if (t.lines.length) { db.day.voided++; db.current = null; }
          printHTML(zReceiptHTML(zData()));
          db.day = DATA.freshDay(db.settings.fond);
          db.user = null; S.screen = 'login'; save();
        } };
      render();
    },

    newProduct() { openProductEditor(null, ''); },
    editProduct(v) { openProductEditor(v); },
    saveProduct() {
      const m = S.modal, err = $('f-err');
      const name = $('f-name').value.trim(), price = DATA.parseEur($('f-price').value), unit = $('f-unit').value, r = Number($('f-rayon').value);
      const ean = $('f-ean').value.replace(/\D/g, '');
      if (!name) { err.textContent = 'Il faut un nom.'; return; }
      if (!(price >= 0) || isNaN(price)) { err.textContent = 'Prix à écrire comme 1,05'; return; }
      if (ean && ![8, 12, 13].includes(ean.length)) { err.textContent = 'Le code-barres a 8 ou 13 chiffres.'; return; }
      if (ean.length === 13 && !EAN.isValid(ean)) { err.textContent = 'Ce code-barres ne passe pas la clé de contrôle.'; return; }
      if (ean && ean[0] === '2' && ean.length === 13) { err.textContent = 'Les codes qui commencent par 2 sont réservés aux étiquettes maison.'; return; }
      if (ean && db.products.some(x => x.ean === ean && x.id !== m.id)) { err.textContent = 'Ce code-barres est déjà utilisé.'; return; }
      let p = db.products.find(x => x.id === m.id);
      if (!p) { p = { id: 'p' + db.nextProduct++, rayon: r, ppp: 0 }; db.products.push(p); }
      if (!p.ppp || p.rayon !== r) p.ppp = Math.max(0, ...db.products.filter(x => x.rayon === r && x !== p).map(x => x.ppp)) + 1;
      Object.assign(p, { name, price, unit, rayon: r, ean: ean || null });
      save(); S.modal = null; render(); toast(`${name} enregistré`);
    },
    deleteProduct() {
      const id = S.modal.id, p = db.products.find(x => x.id === id);
      S.modal = { type: 'confirm', title: `Supprimer ${p ? p.name : 'ce produit'} ?`, yes: 'Supprimer', danger: true, onYes: () => { db.products = db.products.filter(x => x.id !== id); save(); } };
      render();
    },

    labTab(v) { S.label.tab = v; render(); },
    labRayon(v) { S.label.rayon = Number(v); S.label.pid = null; render(); },
    labPick(v) { S.label.pid = v; render(); },
    labShelf(v) { S.label.shelf = Number(v); render(); },
    labCard(v) { S.label.card = Number(v); render(); },
    labCopies(v) { S.label.copies = Math.max(1, Math.min(20, S.label.copies + Number(v))); render(); },
    labPrint() {
      const L = S.label;
      const one = L.tab === 'produit' ? labelHTML('product', db.products.find(x => x.id === L.pid))
        : L.tab === 'rayon' ? labelHTML('shelf', L.shelf) : labelHTML('card', db.cards[L.card]);
      printHTML(Array(L.copies).fill(one).join(''), '62mm 29mm');
    },
    newCard() { S.modal = { type: 'newcard' }; render(); },
    saveCard() {
      const name = $('f-cname').value.trim() || 'Copain';
      const n = db.nextCard++;
      db.cards[n] = { num: n, name, stamps: 0, surprises: 0 };
      S.label.card = n; S.modal = null; save(); render(); toast(`Carte n° ${pad4(n)} créée`);
    },

    printBadge(v) { const s = db.staff.find(x => x.id === v); if (s) printHTML(labelHTML('badge', s), '62mm 29mm'); },
    saveSettings() {
      for (const s of db.staff) {
        const pin = $('pin-' + s.id).value.trim();
        if (!/^\d{4,6}$/.test(pin)) return toast(`Le code de ${s.name} : 4 à 6 chiffres`, true);
      }
      const pins = db.staff.map(s => $('pin-' + s.id).value.trim());
      if (new Set(pins).size !== pins.length) return toast('Deux personnes ont le même code', true);
      const fond = DATA.parseEur($('set-fond').value);
      if (isNaN(fond)) return toast('Fond de caisse à écrire comme 20,00', true);
      db.staff.forEach((s, i) => { s.pin = pins[i]; });
      db.settings.caisse = $('set-caisse').value.trim() || 'Caisse 1';
      db.settings.fond = fond;
      if (!db.day.sales.length) db.day.fond = fond;
      save(); render(); toast('Réglages enregistrés');
    },
    resetAll() {
      S.modal = { type: 'confirm', title: 'Tout effacer ?', text: 'Produits, cartes Copains, tickets et réglages reviennent comme au premier jour.', yes: 'Tout effacer', danger: true,
        onYes: () => { db = DATA.reset(); save(); S.screen = 'login'; } };
      render();
    }
  };

  function openProductEditor(id, ean) {
    S.screen = 'catalog';
    S.modal = { type: 'product', id: id || null, ean: ean || '' };
    render();
  }

  $stage.addEventListener('click', e => {
    if (e.target === $modal && S.modal && S.modal.type !== 'oups') { S.modal = null; render(); return; }
    const el = e.target.closest('[data-a]');
    if (!el || el.disabled) return;
    const fn = A[el.dataset.a];
    if (fn) fn(el.dataset.v, el);
  });

  /* ——— Mise à l'échelle 800 × 480 et horloge ——— */
  function fit() {
    const s = Math.min(window.innerWidth / 800, window.innerHeight / 480);
    $stage.style.transform = `translate(-50%, -50%) scale(${s})`;
  }
  window.addEventListener('resize', fit);
  fit();
  setInterval(() => { const c = $('clock'); if (c) c.textContent = hhmm(); }, 15000);

  render();
  window.CAISSE = { get db() { return db; }, S, onScan };
})();
