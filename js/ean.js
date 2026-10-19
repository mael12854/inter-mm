/* EAN-13 : clé de contrôle, codes maison et dessin SVG lisible par la douchette. */
(function () {
  const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
  const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
  const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
  const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

  function checkDigit(twelve) {
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += Number(twelve[i]) * (i % 2 ? 3 : 1);
    return String((10 - (sum % 10)) % 10);
  }
  function complete(twelve) { return twelve + checkDigit(twelve); }
  function isValid(code) { return /^\d{13}$/.test(code) && checkDigit(code.slice(0, 12)) === code[12]; }

  const pad = (n, len) => String(n).padStart(len, '0');

  /* Code maison : 2 · RR (rayon) · PPP (produit) · cccccc (prix en centimes) · clé */
  function house(rayon, ppp, cents) { return complete('2' + pad(rayon, 2) + pad(ppp, 3) + pad(Math.max(0, cents), 6)); }
  /* Carte Copains : 299 + n° sur 9 chiffres + clé. Badge caissier : 298 + n° + clé. */
  function copains(num) { return complete('299' + pad(num, 9)); }
  function badge(num) { return complete('298' + pad(num, 9)); }

  function parseHouse(code) {
    if (!isValid(code) || code[0] !== '2') return null;
    const p = code.slice(1, 3);
    if (p === '99') return { kind: 'copains', num: Number(code.slice(3, 12)) };
    if (p === '98') return { kind: 'badge', num: Number(code.slice(3, 12)) };
    return { kind: 'house', rayon: Number(p), ppp: Number(code.slice(3, 6)), cents: Number(code.slice(6, 12)) };
  }

  function modules(code) {
    const d = code.split('').map(Number);
    let bits = '101';
    const par = PARITY[d[0]];
    for (let i = 1; i <= 6; i++) bits += (par[i - 1] === 'L' ? L : G)[d[i]];
    bits += '01010';
    for (let i = 7; i <= 12; i++) bits += R[d[i]];
    return bits + '101';
  }

  /* SVG vectoriel : 95 modules + marges blanches de 9 modules. */
  function svg(code, opts) {
    opts = opts || {};
    if (!isValid(code)) return '';
    const bits = modules(code);
    const q = 9, w = 95 + q * 2, h = opts.height || 40;
    let rects = '', x = 0;
    while (x < bits.length) {
      if (bits[x] === '1') {
        let run = 1;
        while (bits[x + run] === '1') run++;
        rects += `<rect x="${x + q}" y="0" width="${run}" height="${h}"/>`;
        x += run;
      } else x++;
    }
    const style = opts.style ? ` style="${opts.style}"` : '';
    return `<svg class="ean" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" shape-rendering="crispEdges"${style} xmlns="http://www.w3.org/2000/svg"><rect width="${w}" height="${h}" fill="#fff"/><g fill="#000">${rects}</g></svg>`;
  }

  function spaced(code) { return code.length === 13 ? `${code[0]} ${code.slice(1, 7)} ${code.slice(7)}` : code; }

  window.EAN = { checkDigit, complete, isValid, house, copains, badge, parseHouse, svg, spaced };
})();
