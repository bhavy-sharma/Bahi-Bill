/* Bahi Bill: a one-screen GST bill maker. Fill the details, see the bill live, print it or save it as PDF.
   Shop details and the current bill are kept in this browser (localStorage). */
(function () {
  'use strict';

  /* ---------- helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nl = s => esc(s).replace(/\n/g, '<br>');
  const uid = () => Math.random().toString(36).slice(2, 9);
  const r2 = n => Math.round((+n + Number.EPSILON) * 100) / 100;
  const num = n => (+n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money = n => '₹' + num(n);
  const qtyf = n => (+n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
  const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
  const fd = s => s ? new Date(s + 'T00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
  const hex = s => /^#[0-9a-f]{6}$/i.test(s) ? s : '#0E6B5C';
  const mix = (a, b, t) => { const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); const x = p(a), y = p(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
  const IN_FRAME = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();

  const STATES = [['01', 'Jammu and Kashmir'], ['02', 'Himachal Pradesh'], ['03', 'Punjab'], ['04', 'Chandigarh'], ['05', 'Uttarakhand'], ['06', 'Haryana'], ['07', 'Delhi'], ['08', 'Rajasthan'], ['09', 'Uttar Pradesh'], ['10', 'Bihar'], ['11', 'Sikkim'], ['12', 'Arunachal Pradesh'], ['13', 'Nagaland'], ['14', 'Manipur'], ['15', 'Mizoram'], ['16', 'Tripura'], ['17', 'Meghalaya'], ['18', 'Assam'], ['19', 'West Bengal'], ['20', 'Jharkhand'], ['21', 'Odisha'], ['22', 'Chhattisgarh'], ['23', 'Madhya Pradesh'], ['24', 'Gujarat'], ['26', 'Dadra and Nagar Haveli and Daman and Diu'], ['27', 'Maharashtra'], ['29', 'Karnataka'], ['30', 'Goa'], ['31', 'Lakshadweep'], ['32', 'Kerala'], ['33', 'Tamil Nadu'], ['34', 'Puducherry'], ['35', 'Andaman and Nicobar Islands'], ['36', 'Telangana'], ['37', 'Andhra Pradesh'], ['38', 'Ladakh'], ['97', 'Other Territory']];
  const RATES = [0, 3, 5, 12, 18, 28, 40];
  const SWATCHES = ['#0E6B5C', '#1F4E79', '#7B1E30', '#9A4B16', '#4B3B8F', '#222222'];
  const stateName = c => (STATES.find(s => s[0] === c) || ['', ''])[1];
  const stateOpts = sel => STATES.map(([c, n]) => `<option value="${c}"${c === sel ? ' selected' : ''}>${n}</option>`).join('');

  function words(n) {
    const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const t = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const two = x => x < 20 ? a[x] : t[Math.floor(x / 10)] + (x % 10 ? ' ' + a[x % 10] : '');
    const three = x => x > 99 ? a[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' + two(x % 100) : '') : two(x);
    const conv = x => {
      if (!x) return '';
      const s = [], cr = Math.floor(x / 1e7); x %= 1e7;
      const l = Math.floor(x / 1e5); x %= 1e5;
      const th = Math.floor(x / 1e3); x %= 1e3;
      if (cr) s.push(conv(cr) + ' Crore'); if (l) s.push(two(l) + ' Lakh'); if (th) s.push(two(th) + ' Thousand'); if (x) s.push(three(x));
      return s.join(' ');
    };
    const rs = Math.floor(Math.abs(n));
    return 'Rupees ' + (conv(rs) || 'Zero') + ' Only';
  }

  /* ---------- state ---------- */
  const KEY = 'bahi_bill_v1';
  const defShop = () => ({ name: '', address: '', phone: '', email: '', gstin: '', state: '09', logo: '', upi: '', qr: defQr(), accent: SWATCHES[0], terms: 'Goods once sold will not be taken back.\nSubject to local jurisdiction.' });
  const defQr = () => ({ on: true, mode: 'upi', name: '', amount: true, title: 'Scan to pay', note: 'Pay with any UPI app', size: 'm', color: 'black', img: '' });
  const newItem = () => ({ id: uid(), name: '', hsn: '', qty: 1, rate: '', gst: 18 });
  const newBill = no => ({ no, date: today(), incl: false, cust: { name: '', phone: '', address: '', gstin: '', state: '' }, items: [newItem()] });
  let S = null;
  try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { S = null; }
  if (!S || !S.shop || !S.bill) S = { shop: defShop(), bill: newBill('INV-001'), saved: {}, editShop: true };
  S.saved = S.saved || {};
  S.shop.qr = Object.assign(defQr(), S.shop.qr || {});
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage blocked: the bill still works for this visit */ } };
  const getPath = p => p.split('.').reduce((o, k) => o[k], S);
  const setPath = (p, v) => { const k = p.split('.'), last = k.pop(); k.reduce((o, x) => o[x], S)[last] = v; };

  function calc() {
    const b = S.bill, sh = S.shop, cs = b.cust.state || sh.state, inter = cs !== sh.state;
    const rows = b.items.filter(i => String(i.name).trim() || +i.rate).map(i => {
      const qty = +i.qty || 0, rate = +i.rate || 0, g = +i.gst || 0, gross = r2(qty * rate);
      const taxable = b.incl ? r2(gross / (1 + g / 100)) : gross;
      const tax = b.incl ? r2(gross - taxable) : r2(taxable * g / 100);
      return { id: i.id, name: i.name, hsn: i.hsn, qty, rate, gst: g, taxable, tax, amount: r2(taxable + tax) };
    });
    const taxable = r2(rows.reduce((s, x) => s + x.taxable, 0)), tax = r2(rows.reduce((s, x) => s + x.tax, 0));
    const cg = inter ? 0 : r2(tax / 2), sg = inter ? 0 : r2(tax - cg), sub = r2(taxable + tax), total = Math.round(sub);
    return { rows, inter, cs, taxable, tax, cg, sg, ig: inter ? tax : 0, sub, total, ro: r2(total - sub) };
  }

  /* ---------- toast ---------- */
  let tT;
  function toast(msg, opt = {}) {
    const el = $('#toast');
    el.className = 'toast show' + (opt.bad ? ' bad' : '');
    el.innerHTML = `<span>${msg}</span>${opt.action ? `<button type="button">${opt.action}</button>` : ''}`;
    if (opt.action) el.querySelector('button').onclick = () => { el.className = 'toast'; opt.onAction(); };
    clearTimeout(tT);
    tT = setTimeout(() => { el.className = 'toast'; }, opt.bad ? 5000 : opt.action ? 6000 : 2600);
  }

  /* ---------- form ---------- */
  const F = $('#form');
  const fld = (path, label, o = {}) => {
    const v = getPath(path);
    const input = o.area ? `<textarea data-f="${path}" rows="${o.rows || 2}" placeholder="${esc(o.ph || '')}">${esc(v)}</textarea>`
      : o.select ? `<select data-f="${path}">${o.select}</select>`
        : `<input data-f="${path}" value="${esc(v)}"${o.type ? ` type="${o.type}"` : ''}${o.im ? ` inputmode="${o.im}"` : ''}${o.max ? ` maxlength="${o.max}"` : ''} placeholder="${esc(o.ph || '')}" autocomplete="off">`;
    return `<label class="f${o.wide ? ' wide' : ''}"><span>${label}${o.opt ? ' <em>optional</em>' : ''}</span>${input}</label>`;
  };

  function renderForm() {
    const sh = S.shop, showShop = S.editShop || !sh.name;
    F.innerHTML = `
    <article class="card">
      <header class="step-h"><span class="step-n">1</span><div><h2>Your shop</h2><p>Saved on this device, so you only fill it once.</p></div>${showShop ? '' : '<button type="button" class="btn sm ghost" data-a="editshop">Edit</button>'}</header>
      ${showShop ? `
      ${sh.name ? '' : '<button type="button" class="sample" data-a="sample">Just looking? Fill with sample details</button>'}
      <div class="grid">
        ${fld('shop.name', 'Shop or business name', { wide: 1, ph: 'e.g. Sharma General Store' })}
        ${fld('shop.address', 'Address', { wide: 1, area: 1, ph: 'Shop no., market, city, PIN code' })}
        ${fld('shop.phone', 'Phone', { im: 'tel', ph: '10-digit mobile' })}
        ${fld('shop.gstin', 'GSTIN', { max: 15, opt: 1, ph: '15 characters' })}
        ${fld('shop.state', 'State', { select: stateOpts(sh.state) })}
        ${fld('shop.terms', 'Note printed at the bottom', { wide: 1, area: 1, opt: 1 })}
        <div class="f"><span>Logo <em>optional</em></span><div class="logo-row">${sh.logo ? `<img src="${sh.logo}" alt="Shop logo"><button type="button" class="link" data-a="rmlogo">Remove</button>` : '<label class="btn sm ghost">Upload logo<input type="file" accept="image/png,image/jpeg,image/webp" id="logo-in" class="sr"></label>'}</div></div>
        <div class="f"><span>Bill colour</span><div class="swatches">${SWATCHES.map(c => `<button type="button" class="sw${c === hex(sh.accent) ? ' on' : ''}" style="background:${c}" data-sw="${c}" aria-label="Use colour ${c}"></button>`).join('')}</div></div>
      </div>
      <div class="step-foot"><button type="button" class="btn primary" data-a="doneshop">Save shop details</button></div>`
      : `<div class="shop-sum">${sh.logo ? `<img src="${sh.logo}" alt="">` : `<span class="shop-av" style="background:${hex(sh.accent)}">${esc(sh.name.trim()[0] || '?').toUpperCase()}</span>`}<div><b>${esc(sh.name)}</b><p>${[sh.gstin ? 'GSTIN ' + esc(sh.gstin) : 'No GSTIN', esc(stateName(sh.state)), esc(sh.phone)].filter(Boolean).join(' · ')}</p></div></div>`}
    </article>
    <article class="card">
      <header class="step-h"><span class="step-n">2</span><div><h2>Customer</h2><p>Leave the name blank for a cash bill.</p></div></header>
      <div class="grid">
        ${fld('bill.no', 'Bill number')}
        ${fld('bill.date', 'Date', { type: 'date' })}
        ${fld('bill.cust.name', 'Customer name', { wide: 1, ph: 'Cash customer' })}
        ${fld('bill.cust.phone', 'Phone', { im: 'tel', opt: 1 })}
        ${fld('bill.cust.gstin', 'Customer GSTIN', { max: 15, opt: 1 })}
        ${fld('bill.cust.address', 'Address', { wide: 1, area: 1, opt: 1 })}
        ${fld('bill.cust.state', 'Customer state', { wide: 1, select: stateOpts(S.bill.cust.state || sh.state) })}
      </div>
      <p class="gst-mode" id="gst-mode"></p>
    </article>
    <article class="card">
      <header class="step-h"><span class="step-n">3</span><div><h2>Items</h2><p>Enter quantity and rate. GST is added for you.</p></div></header>
      <label class="check"><input type="checkbox" data-f="bill.incl"${S.bill.incl ? ' checked' : ''}> My rates already include GST</label>
      <div class="items" id="items"></div>
      <button type="button" class="btn ghost add" data-a="add"><span aria-hidden="true">+</span> Add another item</button>
      <dl class="totals" id="totals"></dl>
    </article>
    ${qrCard()}
    <datalist id="saved-items">${Object.keys(S.saved).map(n => `<option value="${esc(n)}">`).join('')}</datalist>`;
    renderItems();
  }

  function renderItems() {
    $('#items').innerHTML = S.bill.items.map((it, i) => `<div class="it" data-id="${it.id}">
      <label class="it-name"><span>Item ${i + 1}</span><input data-k="name" list="saved-items" value="${esc(it.name)}" placeholder="Item name" autocomplete="off"></label>
      <label class="it-hsn"><span>HSN</span><input data-k="hsn" value="${esc(it.hsn)}" inputmode="numeric" placeholder="—"></label>
      <label class="it-qty"><span>Qty</span><input data-k="qty" type="number" min="0" step="any" value="${it.qty}"></label>
      <label class="it-rate"><span>Rate ₹</span><input data-k="rate" type="number" min="0" step="any" value="${it.rate}" placeholder="0"></label>
      <label class="it-gst"><span>GST</span><select data-k="gst">${RATES.map(r => `<option value="${r}"${+it.gst === r ? ' selected' : ''}>${r}%</option>`).join('')}</select></label>
      <p class="it-amt"><span>Amount</span><b data-amt>₹0.00</b></p>
      <button type="button" class="it-del" data-a="del" aria-label="Remove item ${i + 1}">×</button>
    </div>`).join('');
    update();
  }

  function update() {
    const c = calc(), sh = S.shop;
    $$('#items .it').forEach(el => { const r = c.rows.find(x => x.id === el.dataset.id); el.querySelector('[data-amt]').textContent = money(r ? r.amount : 0); });
    const gm = $('#gst-mode');
    if (gm) gm.innerHTML = c.inter ? `<b>Other state</b> · IGST will be charged (${esc(stateName(sh.state))} → ${esc(stateName(c.cs))})` : `<b>Same state</b> · CGST + SGST will be charged`;
    const t = $('#totals');
    if (t) t.innerHTML = `<div><dt>Before tax</dt><dd>${money(c.taxable)}</dd></div>${c.inter ? `<div><dt>IGST</dt><dd>${money(c.ig)}</dd></div>` : `<div><dt>CGST</dt><dd>${money(c.cg)}</dd></div><div><dt>SGST</dt><dd>${money(c.sg)}</dd></div>`}${c.ro ? `<div><dt>Round off</dt><dd>${c.ro > 0 ? '+' : '−'}${num(Math.abs(c.ro))}</dd></div>` : ''}<div class="grand"><dt>Total</dt><dd>${money(c.total)}</dd></div>`;
    const qp = $('#qr-prev');
    if (qp) { const blk = qrBlock(c); qp.innerHTML = blk ? `<div class="bill qr-mini" style="--acc:${hex(sh.accent)};--tint2:${mix(hex(sh.accent), '#ffffff', 0.955)}">${blk}</div>` : `<p class="qr-empty">${S.shop.qr.mode === 'img' ? 'Upload your QR image to see it here.' : 'Enter your UPI ID to make the QR.'}</p>`; }
    const uw = $('#upi-warn');
    if (uw) uw.textContent = sh.upi && !UPI_RE.test(String(sh.upi).trim()) ? 'This UPI ID does not look right. It looks like name@bank, for example sharma@okaxis.' : '';
    $('#paper-fit').innerHTML = billHTML(c);
    requestAnimationFrame(fitPaper);
  }

  /* ---------- the bill ---------- */
  const QR_IC = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1"/><path d="M14 14h2.5v2.5H14zM18 18h2.5v2.5H18zM18 14h2.5M14 18v2.5"/></svg>';
  const UPI_RE = /^[\w.\-]{2,}@[a-zA-Z]{2,}$/;
  let qrCache = { k: '', v: '' };
  function qrSrc(c) {
    const q = S.shop.qr, sh = S.shop;
    if (!q.on) return '';
    if (q.mode === 'img') return q.img || '';
    const upi = String(sh.upi || '').trim();
    if (!upi || !UPI_RE.test(upi) || !window.qrcode) return '';
    const amt = q.amount && c.total > 0 ? `&am=${c.total.toFixed(2)}` : '';
    const text = `upi://pay?pa=${upi}&pn=${encodeURIComponent(String(q.name || sh.name || '').trim())}${amt}&cu=INR&tn=${encodeURIComponent('Bill ' + S.bill.no)}`;
    const color = q.color === 'accent' ? hex(sh.accent) : '#000000', key = text + color;
    if (qrCache.k === key) return qrCache.v;
    try {
      const qr = qrcode(0, 'M'); qr.addData(text); qr.make();
      const n = qr.getModuleCount(), cell = 8, cv = document.createElement('canvas');
      cv.width = cv.height = n * cell;
      const g = cv.getContext('2d');
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, cv.width, cv.height); g.fillStyle = color;
      for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (qr.isDark(r, k)) g.fillRect(k * cell, r * cell, cell, cell);
      qrCache = { k: key, v: cv.toDataURL('image/png') };
      return qrCache.v;
    } catch (e) { return ''; }
  }
  function qrBlock(c) {
    const src = qrSrc(c), q = S.shop.qr;
    if (!src) return '';
    return `<div class="b-box b-qr qr-${q.size}"><img src="${src}" alt="Payment QR code"${q.mode === 'img' ? ' class="own"' : ''}><div><h3>${esc(q.title || 'Scan to pay')}</h3><p class="b-amt">${money(c.total)}</p>${q.mode === 'upi' ? `<p>UPI: ${esc(S.shop.upi)}</p>` : ''}${q.note ? `<p class="b-qnote">${esc(q.note)}</p>` : ''}</div></div>`;
  }
  function qrCard() {
    const q = S.shop.qr, sh = S.shop;
    const seg = (k, opts) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button type="button" data-q="${k}:${v}" aria-pressed="${q[k] === v}">${l}</button>`).join('')}</div>`;
    return `<article class="card qr-card">
      <header class="step-h"><span class="step-n">${QR_IC}</span><div><h2>Payment QR</h2><p>Customers scan it on the bill to pay you by UPI.</p></div>
        <label class="switch" title="Show QR on bill"><input type="checkbox" data-f="shop.qr.on"${q.on ? ' checked' : ''}><span class="sw-track"></span><span class="sr">Show QR on bill</span></label></header>
      ${q.on ? `<div class="qr-grid">
        <div class="qr-opts">
          <div class="f"><span>Where the QR comes from</span>${seg('mode', [['upi', 'Make from my UPI ID'], ['img', 'Upload my own QR']])}</div>
          ${q.mode === 'upi' ? `${fld('shop.upi', 'UPI ID', { ph: 'yourname@okhdfcbank' })}<p class="warn" id="upi-warn"></p>
            ${fld('shop.qr.name', 'Name shown in the UPI app', { opt: 1, ph: sh.name || 'Your shop name' })}
            <label class="check"><input type="checkbox" data-f="shop.qr.amount"${q.amount ? ' checked' : ''}> Fill the bill amount automatically when scanned</label>
            <div class="f"><span>QR colour</span>${seg('color', [['black', 'Black'], ['accent', 'Bill colour']])}</div>`
          : `<div class="f"><span>Your QR image</span><div class="logo-row">${q.img ? `<img class="qr-thumb" src="${q.img}" alt="Your QR"><label class="btn sm ghost">Change<input type="file" accept="image/png,image/jpeg,image/webp" id="qr-in" class="sr"></label><button type="button" class="link" data-a="rmqr">Remove</button>` : '<label class="btn sm">Upload QR image<input type="file" accept="image/png,image/jpeg,image/webp" id="qr-in" class="sr"></label>'}</div><small class="hint">Use the QR from PhonePe, Google Pay, Paytm or your bank. Crop the photo to just the QR. The customer types the amount.</small></div>`}
          ${fld('shop.qr.title', 'Heading', { ph: 'Scan to pay' })}
          ${fld('shop.qr.note', 'Small line below', { opt: 1, ph: 'e.g. GPay, PhonePe, Paytm accepted' })}
          <div class="f"><span>Size on the bill</span>${seg('size', [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']])}</div>
        </div>
        <div class="qr-prev"><span class="qr-prev-l">Preview</span><div id="qr-prev"></div><small class="hint">Scan it once with your phone to check it opens your UPI.</small></div>
      </div>` : '<p class="hint">The QR is hidden on bills. Switch it on to show it again.</p>'}
    </article>`;
  }
  function billHTML(c) {
    c = c || calc();
    const sh = S.shop, b = S.bill, cu = b.cust, acc = hex(sh.accent);
    return `<div class="bill" style="--acc:${acc};--tint:${mix(acc, '#ffffff', 0.9)};--tint2:${mix(acc, '#ffffff', 0.955)}">
      <header class="b-head">
        <div class="b-shop">${sh.logo ? `<img class="b-logo" src="${sh.logo}" alt="">` : ''}<div>
          <h1${sh.name ? '' : ' class="ph"'}>${esc(sh.name || 'Your shop name')}</h1>
          ${sh.address ? `<p>${nl(sh.address)}</p>` : '<p class="ph">Shop address</p>'}
          ${sh.phone || sh.email ? `<p>${[sh.phone && 'Phone: ' + esc(sh.phone), sh.email && esc(sh.email)].filter(Boolean).join(' · ')}</p>` : ''}
          ${sh.gstin ? `<p class="b-gst">GSTIN: ${esc(sh.gstin)}</p>` : ''}</div></div>
        <div class="b-title"><h2>${sh.gstin ? 'TAX INVOICE' : 'INVOICE'}</h2>
          <dl><div><dt>Bill no.</dt><dd>${esc(b.no)}</dd></div><div><dt>Date</dt><dd>${fd(b.date)}</dd></div></dl></div>
      </header>
      <section class="b-parties">
        <div><h3>Bill to</h3><p class="b-cname">${esc(cu.name || 'Cash customer')}</p>${cu.address ? `<p>${nl(cu.address)}</p>` : ''}${cu.phone ? `<p>Phone: ${esc(cu.phone)}</p>` : ''}${cu.gstin ? `<p class="b-gst">GSTIN: ${esc(cu.gstin)}</p>` : ''}</div>
        <div><h3>Supply details</h3><p>Place of supply: <b>${esc(stateName(c.cs))} (${c.cs})</b></p><p>Tax: <b>${c.inter ? 'IGST, inter-state' : 'CGST + SGST, intra-state'}</b></p>${b.incl ? '<p>Rates shown include GST</p>' : ''}</div>
      </section>
      <table class="b-items">
        <thead><tr><th class="c">#</th><th class="l">Item</th><th class="c">HSN</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Taxable value</th><th class="r">GST</th><th class="r">Amount</th></tr></thead>
        <tbody>${c.rows.length ? c.rows.map((r, i) => `<tr><td class="c">${i + 1}</td><td class="l">${esc(r.name)}</td><td class="c">${esc(r.hsn) || '–'}</td><td class="r">${qtyf(r.qty)}</td><td class="r">${num(r.rate)}</td><td class="r">${num(r.taxable)}</td><td class="r">${qtyf(r.gst)}%<small>${num(r.tax)}</small></td><td class="r"><b>${num(r.amount)}</b></td></tr>`).join('') : '<tr><td colspan="8" class="b-empty">Items you add will appear here.</td></tr>'}</tbody>
      </table>
      <section class="b-sum">
        <div class="b-left">
          <div class="b-box"><h3>Amount in words</h3><p class="b-words">${words(c.total)}</p></div>
          ${qrBlock(c)}
          ${sh.terms ? `<div class="b-terms"><h3>Note</h3><p>${nl(sh.terms)}</p></div>` : ''}
        </div>
        <div class="b-right">
          <dl class="b-tot"><div><dt>Taxable value</dt><dd>${num(c.taxable)}</dd></div>${c.inter ? `<div><dt>IGST</dt><dd>${num(c.ig)}</dd></div>` : `<div><dt>CGST</dt><dd>${num(c.cg)}</dd></div><div><dt>SGST</dt><dd>${num(c.sg)}</dd></div>`}${c.ro ? `<div><dt>Round off</dt><dd>${c.ro > 0 ? '+' : '−'}${num(Math.abs(c.ro))}</dd></div>` : ''}
            <div class="b-grand"><dt>Total</dt><dd>${money(c.total)}</dd></div></dl>
          <div class="b-sign"><p>For ${esc(sh.name || 'Your shop name')}</p><span></span><p>Authorised signatory</p></div>
        </div>
      </section>
      <footer class="b-foot">Thank you for your business!</footer>
    </div>`;
  }

  function fitPaper() {
    const w = $('#paper-wrap'), f = $('#paper-fit'), p = f && f.firstElementChild;
    if (!p || !w.offsetWidth) return;
    const avail = w.clientWidth - 48;
    f.style.transform = '';
    const s = Math.min(1, avail / p.offsetWidth);
    f.style.transform = `scale(${s})`;
    f.style.marginLeft = Math.max(0, (avail - p.offsetWidth * s) / 2) + 'px';
    f.style.height = p.offsetHeight * s + 'px';
  }
  window.addEventListener('resize', fitPaper);

  /* ---------- print + pdf ---------- */
  const fileName = () => (S.bill.no + '_' + (S.bill.cust.name || 'Cash')).replace(/[^\w\-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const ready = el => Promise.all($$('img', el).map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; })));
  function check() {
    if (!S.shop.name.trim()) { S.editShop = true; renderForm(); showPane('form'); toast('Add your shop name first. It goes at the top of the bill.', { bad: 1 }); $('[data-f="shop.name"]').focus(); return false; }
    if (!calc().rows.some(r => String(r.name).trim())) { showPane('form'); toast('Add at least one item with a name.', { bad: 1 }); const i = $('#items [data-k="name"]'); if (i) i.focus(); return false; }
    return true;
  }
  function remember() {
    S.bill.items.forEach(i => { const n = String(i.name).trim(); if (n && +i.rate) S.saved[n] = { hsn: i.hsn, rate: i.rate, gst: i.gst }; });
    const names = Object.keys(S.saved);
    if (names.length > 300) names.slice(0, names.length - 300).forEach(n => delete S.saved[n]);
    save();
    const dl = $('#saved-items'); if (dl) dl.innerHTML = Object.keys(S.saved).map(n => `<option value="${esc(n)}">`).join('');
  }
  async function doPrint() {
    if (!check()) return;
    remember();
    const pa = $('#print-area');
    pa.innerHTML = billHTML();
    await ready(pa);
    document.body.classList.add('printing');
    const old = document.title; document.title = fileName();
    if (IN_FRAME) toast('Printing is blocked in this preview. Open index.html from the ZIP to print.', { bad: 1 });
    setTimeout(() => { window.print(); setTimeout(() => { document.title = old; }, 400); }, 30);
  }
  window.addEventListener('afterprint', () => { document.body.classList.remove('printing'); $('#print-area').innerHTML = ''; });
  async function doPdf() {
    if (!check()) return;
    if (!window.html2pdf) { toast('The PDF tool did not load. Use Print and choose “Save as PDF”.', { bad: 1 }); return; }
    remember();
    toast(IN_FRAME ? 'Downloads are blocked in this preview. Open index.html from the ZIP to save PDFs.' : 'Making your PDF…', { bad: IN_FRAME });
    const st = $('#pdf-stage');
    st.innerHTML = billHTML();
    const el = st.firstElementChild;
    el.classList.add('for-pdf');
    await ready(el);
    try {
      await html2pdf().set({ margin: 0, filename: fileName() + '.pdf', image: { type: 'jpeg', quality: 0.97 }, html2canvas: { scale: 2, backgroundColor: '#ffffff', logging: false, scrollX: 0, scrollY: 0 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }, pagebreak: { mode: ['avoid-all', 'css', 'legacy'] } }).from(el).save();
      if (!IN_FRAME) toast(`Saved ${esc(fileName())}.pdf`);
    } catch (e) { toast('Could not make the PDF. Use Print and choose “Save as PDF”.', { bad: 1 }); }
    st.innerHTML = '';
  }
  const nextNo = s => /\d/.test(s) ? s.replace(/(\d+)(?!.*\d)/, m => String(+m + 1).padStart(m.length, '0')) : s + '-2';
  function newBillAct() {
    const prev = JSON.parse(JSON.stringify(S.bill));
    if (calc().rows.length) remember();
    S.bill = newBill(nextNo(prev.no));
    save(); renderForm(); showPane('form');
    toast(`New bill ${esc(S.bill.no)} started`, { action: 'Undo', onAction: () => { S.bill = prev; save(); renderForm(); } });
  }

  /* ---------- events ---------- */
  F.addEventListener('input', e => {
    const t = e.target, row = t.closest('.it[data-id]');
    if (row && t.dataset.k) {
      const it = S.bill.items.find(x => x.id === row.dataset.id);
      it[t.dataset.k] = t.value;
      if (t.dataset.k === 'name' && S.saved[t.value.trim()]) {
        const s = S.saved[t.value.trim()];
        Object.assign(it, { hsn: s.hsn || '', rate: s.rate, gst: s.gst });
        ['hsn', 'rate', 'gst'].forEach(k => { row.querySelector(`[data-k="${k}"]`).value = it[k]; });
      }
      save(); return update();
    }
    const f = t.dataset.f;
    if (!f) return;
    let v = t.type === 'checkbox' ? t.checked : t.value;
    if (/gstin$/.test(f)) {
      v = v.toUpperCase().replace(/\s/g, ''); t.value = v;
      const sc = v.slice(0, 2), target = f === 'shop.gstin' ? 'shop.state' : 'bill.cust.state';
      if (v.length >= 2 && stateName(sc)) { setPath(target, sc); const sel = $(`[data-f="${target}"]`); if (sel) sel.value = sc; }
    }
    setPath(f, v);
    save();
    if (f === 'shop.qr.on' || f === 'shop.qr.amount') return renderForm();
    update();
  });
  F.addEventListener('change', async e => {
    const tid = e.target.id;
    if ((tid !== 'logo-in' && tid !== 'qr-in') || !e.target.files[0]) return;
    const file = e.target.files[0];
    if (!/^image\//.test(file.type) || file.size > 5e6) { toast('Choose a PNG or JPG image under 5 MB.', { bad: 1 }); return; }
    const url = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });
    const im = new Image();
    im.onload = () => {
      const s = Math.min(1, (tid === 'qr-in' ? 640 : 360) / Math.max(im.width, im.height)), cv = document.createElement('canvas');
      cv.width = Math.round(im.width * s); cv.height = Math.round(im.height * s);
      cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
      const data = cv.toDataURL('image/png');
      if (tid === 'qr-in') { S.shop.qr.img = data; toast('QR image added. Scan the preview once to check it.'); } else S.shop.logo = data;
      save(); renderForm();
    };
    im.onerror = () => toast('This image could not be read.', { bad: 1 });
    im.src = url;
  });
  F.addEventListener('click', e => {
    const sw = e.target.closest('[data-sw]');
    if (sw) { S.shop.accent = sw.dataset.sw; $$('.sw').forEach(x => x.classList.toggle('on', x === sw)); save(); return update(); }
    const qb = e.target.closest('[data-q]');
    if (qb) { const [k, v] = qb.dataset.q.split(':'); S.shop.qr[k] = v; save(); return renderForm(); }
    const a = e.target.closest('[data-a]'); if (!a) return;
    const act = a.dataset.a;
    if (act === 'add') { S.bill.items.push(newItem()); save(); renderItems(); const ins = $$('#items [data-k="name"]'); ins[ins.length - 1].focus(); }
    else if (act === 'del') { const id = a.closest('.it').dataset.id; S.bill.items = S.bill.items.filter(i => i.id !== id); if (!S.bill.items.length) S.bill.items.push(newItem()); save(); renderItems(); }
    else if (act === 'editshop') { S.editShop = true; save(); renderForm(); }
    else if (act === 'doneshop') {
      if (!S.shop.name.trim()) { toast('Enter your shop name.', { bad: 1 }); $('[data-f="shop.name"]').focus(); return; }
      if (S.shop.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(S.shop.gstin)) { toast('This GSTIN does not look right. It has 15 characters, like 09ABCDE1234F1Z5.', { bad: 1 }); return; }
      S.editShop = false; save(); renderForm(); toast('Shop details saved');
    }
    else if (act === 'rmlogo') { S.shop.logo = ''; save(); renderForm(); }
    else if (act === 'rmqr') { S.shop.qr.img = ''; save(); renderForm(); }
    else if (act === 'sample') {
      Object.assign(S.shop, { name: 'Sharma General Store', address: '12, Sadar Bazaar, Meerut\nUttar Pradesh - 250001', phone: '9876543210', gstin: '09ABCPS1234K1ZK', state: '09', upi: 'sharmastore@upi' });
      S.bill.cust = { name: 'Ramesh Kumar', phone: '9812345678', address: 'Shastri Nagar, Meerut', gstin: '', state: '09' };
      S.bill.items = [
        { id: uid(), name: 'Basmati Rice 5 kg', hsn: '1006', qty: 2, rate: 540, gst: 5 },
        { id: uid(), name: 'Mustard Oil 1 L', hsn: '1514', qty: 3, rate: 165, gst: 5 },
        { id: uid(), name: 'Steel Water Bottle 1 L', hsn: '7323', qty: 1, rate: 349, gst: 18 }
      ];
      S.editShop = false; save(); renderForm(); toast('Sample details filled. Change anything to make it yours.');
    }
  });
  $('#act-print').onclick = doPrint;
  $('#act-pdf').onclick = doPdf;
  $('#act-new').onclick = newBillAct;
  function showPane(p) {
    $('#layout').dataset.pane = p;
    $$('.tabs-m button').forEach(b => b.setAttribute('aria-pressed', b.dataset.pane === p));
    if (p === 'preview') requestAnimationFrame(fitPaper);
  }
  $$('.tabs-m button').forEach(b => { b.onclick = () => { showPane(b.dataset.pane); window.scrollTo(0, 0); }; });
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') { e.preventDefault(); doPrint(); } });

  renderForm();
})();
