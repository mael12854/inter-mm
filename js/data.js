/* Données de la caisse : rayons, produits de départ, sauvegarde dans le navigateur, sons. */
(function () {
  const C = {
    marin: 'oklch(0.55 0.17 250)',
    mael: 'oklch(0.55 0.17 30)',
    ink: 'oklch(0.24 0.03 255)',
    paper: 'oklch(0.975 0.012 85)',
    bip: 'oklch(0.62 0.15 150)',
    oups: 'oklch(0.86 0.13 90)'
  };

  /* Pictos : trait épais, un seul objet, couleur = currentColor. */
  const PICTO = {
    1: '<path d="M12 7.5c-1.6-1.3-4.3-1.5-6 .3-1.9 2-1.6 5.6.1 8.6 1.4 2.5 3.6 4.4 5.9 3.4 2.3 1 4.5-.9 5.9-3.4 1.7-3 2-6.6.1-8.6-1.7-1.8-4.4-1.6-6-.3z"/><path d="M12 7.5c0-2 .9-3.6 3-4.5"/>',
    2: '<path d="M15.5 8.5c-2.6-2.6-6.4.6-11.5 11.5 10.9-5.1 14.1-8.9 11.5-11.5z"/><path d="M15.5 8.5 19 5M15.5 8.5l4.5-.5M15.5 8.5 16 4"/><path d="M9 13l1.5 1.5M7 16.5l1 1"/>',
    3: '<path d="M4.5 19.5c-2-2 10.5-15.5 14.5-15 3.5.5-10 17.5-14.5 15z"/><path d="M9 12.5l2 2M12 9.5l2 2M15 6.5l2 2"/>',
    4: '<path d="M9.5 3h5M10 3v3L8 9.5V20a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V9.5L14 6V3"/><path d="M8 13h8"/>',
    5: '<circle cx="12" cy="12" r="8.5"/><circle cx="9" cy="9.5" r=".9"/><circle cx="14.5" cy="8.5" r=".9"/><circle cx="15" cy="14" r=".9"/><circle cx="9.5" cy="15" r=".9"/><circle cx="12" cy="12" r=".9"/>',
    6: '<path d="M6 8.5h12L16.5 21h-9z"/><path d="M13.5 8.5 15.5 3H19"/><path d="M7 13h10"/>',
    7: '<path d="M3.5 11.5 12 4l8.5 7.5"/><path d="M6 10v10.5h12V10"/><path d="M10 20.5V15h4v5.5"/>',
    8: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c3.2 2.6 3.2 14.4 0 17M12 3.5c-3.2 2.6-3.2 14.4 0 17"/>'
  };
  function picto(n, size, stroke) {
    return `<svg class="picto" width="${size || 32}" height="${size || 32}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke || 2.2}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PICTO[n] || ''}</svg>`;
  }

  const RAYONS = [
    { n: 1, name: 'Fruits', bg: 'oklch(0.86 0.09 30)' },
    { n: 2, name: 'Légumes', bg: 'oklch(0.86 0.09 150)' },
    { n: 3, name: 'Boulangerie', bg: 'oklch(0.86 0.09 80)' },
    { n: 4, name: 'Frais', bg: 'oklch(0.86 0.09 250)' },
    { n: 5, name: 'Goûter', bg: 'oklch(0.86 0.09 350)' },
    { n: 6, name: 'Boissons', bg: 'oklch(0.86 0.09 210)' },
    { n: 7, name: 'Maison', bg: 'oklch(0.86 0.09 110)' },
    { n: 8, name: 'Jouets', bg: 'oklch(0.86 0.09 300)' }
  ];
  const rayon = n => RAYONS.find(r => r.n === Number(n)) || { n, name: 'Rayon ' + n, bg: '#eee' };

  /* [rayon, nom, prix en centimes, vente, code EAN sur 12 chiffres (clé ajoutée) ou null] */
  const SEED = [
    [1, 'Bananes', 200, 'kg'], [1, 'Pommes du jardin', 40, 'piece'], [1, 'Poires', 45, 'piece'], [1, 'Raisin', 350, 'kg'],
    [1, 'Clémentines', 280, 'kg'], [1, 'Kiwis', 30, 'piece'], [1, 'Fraises', 250, 'barq'], [1, 'Citron', 35, 'piece'],
    [2, 'Carottes', 190, 'kg'], [2, 'Tomates', 290, 'kg'], [2, 'Pommes de terre', 150, 'kg'], [2, 'Courgettes', 220, 'kg'],
    [2, 'Concombre', 80, 'piece'], [2, 'Salade', 100, 'piece'], [2, 'Avocat', 90, 'piece'], [2, 'Poireaux', 260, 'kg'],
    [3, 'Baguette', 110, 'piece'], [3, 'Croissant', 95, 'piece'], [3, 'Pain au chocolat', 105, 'piece'], [3, 'Gâteau maison', 137, 'piece'],
    [3, 'Pain de mie', 189, 'piece', '302933000189'],
    [4, 'Lait demi-écrémé', 105, 'piece', '356007000105'], [4, 'Yaourts nature ×4', 165, 'piece', '356007000165'],
    [4, 'Beurre doux', 245, 'piece', '356007000245'], [4, 'Emmental râpé', 219, 'piece', '356007000219'], [4, 'Œufs ×6', 230, 'piece'],
    [5, 'Compote pomme', 160, 'piece', '356470000160'], [5, 'Biscuits chocolat', 145, 'piece', '356470000145'],
    [5, 'Madeleines', 199, 'piece', '356470000199'], [5, 'Crêpe maison', 50, 'piece'],
    [6, "Jus d'orange", 210, 'piece', '325039000210'], [6, 'Eau 1,5 L', 45, 'piece', '325039000045'],
    [6, 'Sirop de grenadine', 259, 'piece', '325039000259'], [6, 'Limonade', 135, 'piece', '325039000135'],
    [7, 'Éponges ×3', 120, 'piece', '354010000120'], [7, 'Papier toilette', 350, 'piece', '354010000350'],
    [7, 'Liquide vaisselle', 179, 'piece', '354010000179'], [7, 'Bougie maison', 300, 'piece'],
    [8, 'Billes (sachet)', 100, 'piece'], [8, 'Dessin de Marin', 50, 'piece'], [8, 'Bracelet de Maël', 150, 'piece'],
    [8, 'Petite voiture', 299, 'piece', '376012000299']
  ];

  function seedProducts() {
    const counters = {};
    return SEED.map(([r, name, price, unit, ean], i) => {
      counters[r] = (counters[r] || 0) + 1;
      return { id: 'p' + (i + 1), rayon: r, ppp: counters[r], name, price, unit, ean: ean ? EAN.complete(ean) : null };
    });
  }

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function freshDay(fond) {
    return { date: today(), fond, sales: [], voided: 0, drawer: 0 };
  }

  function defaults() {
    return {
      v: 1,
      products: seedProducts(),
      nextProduct: SEED.length + 1,
      cards: { 42: { num: 42, name: 'Mamie Jo', stamps: 7, surprises: 0 } },
      nextCard: 43,
      staff: [
        { id: 'marin', name: 'Marin', role: 'Caissier', pin: '1111', badge: 1, color: C.marin },
        { id: 'mael', name: 'Maël', role: 'Responsable', pin: '102456', badge: 2, color: C.mael, manager: true }
      ],
      settings: { caisse: 'Caisse 1', fond: 2000 },
      ticketNo: 0,
      day: freshDay(2000),
      history: [],
      current: null,
      parked: [],
      user: null
    };
  }

  const KEY = 'inter-mm.caisse.v1';
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const db = Object.assign(defaults(), JSON.parse(raw));
        return db;
      }
    } catch (e) { /* stockage indisponible : on repart des valeurs par défaut */ }
    return defaults();
  }
  function save(db) {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* rien */ }
  }
  function reset() {
    try { localStorage.removeItem(KEY); } catch (e) { /* rien */ }
    return defaults();
  }

  /* Argent : tout est en centimes. 1,89 € — virgule, espace insécable, symbole après. */
  function num(c) {
    const neg = c < 0; c = Math.abs(Math.round(c));
    const e = Math.floor(c / 100), s = String(c % 100).padStart(2, '0');
    return (neg ? '−' : '') + String(e).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + s;
  }
  const eur = c => num(c) + ' €';
  const kg = g => (g / 1000).toFixed(3).replace('.', ',');
  function parseEur(str) {
    if (str == null) return NaN;
    str = String(str).trim().replace(/\s|€/g, '').replace('.', ',');
    if (!/^\d+(,\d{0,2})?$/.test(str)) return NaN;
    const [e, s = ''] = str.split(',');
    return Number(e) * 100 + Number((s + '00').slice(0, 2));
  }
  const unitLabel = u => (u === 'kg' ? '/kg' : u === 'barq' ? ' barq.' : ' pièce');

  /* Sons : exactement ceux du guide (06). */
  let ctx = null;
  function tone(seq) {
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      let t = ctx.currentTime;
      seq.forEach(([f, d, type]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type || 'square'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.15, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + d + 0.02);
        t += d + 0.03;
      });
    } catch (e) { /* pas de son disponible */ }
  }
  const SOUND = {
    bip: () => tone([[1800, 0.09]]),
    oups: () => tone([[660, 0.14, 'triangle'], [440, 0.2, 'triangle']]),
    encore: () => tone([[1800, 0.06], [1800, 0.06]]),
    ding: () => tone([[880, 0.15, 'sine'], [1320, 0.3, 'sine']]),
    copain: () => tone([[660, 0.08, 'sine'], [880, 0.08, 'sine'], [1100, 0.16, 'sine']]),
    imprime: () => tone([[300, 0.05, 'sawtooth'], [300, 0.05, 'sawtooth'], [300, 0.05, 'sawtooth']]),
    touche: () => tone([[1200, 0.025, 'sine']])
  };

  const MOTS = ['Merci, à demain !', 'Bon appétit !', 'Revenez vite !', 'Bonne journée !', 'À bientôt les copains !', 'Merci et bisous !', 'Bonne soirée !'];
  function petitMot(date) {
    const d = date ? new Date(date) : new Date();
    const start = new Date(d.getFullYear(), 0, 0);
    return MOTS[Math.floor((d - start) / 864e5) % MOTS.length];
  }

  window.DATA = { C, RAYONS, rayon, picto, load, save, reset, freshDay, today, num, eur, kg, parseEur, unitLabel, SOUND, petitMot };
})();
