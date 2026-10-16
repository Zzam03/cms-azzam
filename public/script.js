/* ============================================================
   SIMPUL. — script.js  (versi terhubung ke CMS)
   Alur: halaman dimuat → ambil data dari /api/content → isi HTML dengan data itu.
   ============================================================ */

/* ---------- Helper ---------- */
const $ = (id) => document.getElementById(id);
const rupiah = (n) => 'Rp' + Number(n).toLocaleString('id-ID');

// Escape HTML: teks dari database TIDAK boleh langsung dimasukkan ke innerHTML (anti-XSS)
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// "punya *karakter*" → "punya <em>karakter</em>", baris baru → <br>
const fmtTitle = (t) => esc(t).replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/\n/g, '<br>');

let PRODUCTS = [];
let WA_NUMBER = '6281234567890'; // cadangan, akan ditimpa data dari admin
let currentFilter = 'semua';

/* ---------- Scroll reveal (animasi muncul saat di-scroll) ---------- */
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12 }
);
const watchReveal = () => document.querySelectorAll('.reveal:not(.in)').forEach((el) => revealObserver.observe(el));

/* ---------- WhatsApp ---------- */
function waLinkForProduct(p) {
  const msg = `Halo SIMPUL., saya mau pesan produk "${p.name}" (${rupiah(p.price)}). Apakah masih tersedia?`;
  return `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`;
}

/* ---------- Render: Hero & Tentang ---------- */
function renderHero(h) {
  if (!h || !h.title) return;
  $('heroTitle').innerHTML = fmtTitle(h.title);
  if (h.subtitle) $('heroDesc').textContent = h.subtitle;
  if (h.image) $('heroImg').src = h.image;
  if (h.cta_text) $('heroCta').textContent = h.cta_text;
  if (h.cta_link) $('heroCta').setAttribute('href', h.cta_link);
}

function renderAbout(a) {
  if (!a || !a.title) return;
  $('aboutTitle').textContent = a.title;
  if (a.image) $('aboutImg').src = a.image;
  const paragraphs = String(a.text || '').split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean);
  if (paragraphs.length) $('aboutText').innerHTML = paragraphs.map((t) => `<p>${esc(t)}</p>`).join('');
}

/* ---------- Render: Kontak, footer, tombol WhatsApp ---------- */
function setText(id, value) {
  if ($(id) && value) $(id).textContent = value;
}
function setLink(id, url) {
  const el = $(id);
  if (!el) return;
  if (url) { el.href = url; el.hidden = false; } else { el.hidden = true; }
}

function renderContact(c) {
  if (!c) return;
  setText('contactAddress', c.address); setText('footAddress', c.address);
  setText('contactPhone', c.phone);     setText('footPhone', c.phone);
  setText('contactEmail', c.email);     setText('footEmail', c.email);
  setLink('contactIg', c.instagram);    setLink('footIg', c.instagram);
  setLink('contactTt', c.tiktok);       setLink('footTt', c.tiktok);

  if (c.whatsapp) {
    WA_NUMBER = c.whatsapp;
    // semua link wa.me di halaman (tombol CTA, footer, tombol melayang) diganti nomornya
    document.querySelectorAll('a[href*="wa.me/"]').forEach((a) => {
      a.href = a.href.replace(/wa\.me\/\d+/, 'wa.me/' + c.whatsapp);
    });
  }
}

/* ---------- Render: Produk unggulan ---------- */
function renderFeatured() {
  const list = PRODUCTS.filter((p) => p.featured).slice(0, 3);
  const grid = $('featuredGrid');
  if (!list.length) {
    grid.innerHTML = '<p class="empty-note">Belum ada produk unggulan.</p>';
    return;
  }
  grid.innerHTML = list.map((p, i) => `
    <article class="featured-card reveal">
      <div class="featured-img"><img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy"></div>
      <span class="badge badge-best">№ ${i + 1} Terlaris</span>
      <h3>${esc(p.name)}</h3>
      <p class="price"><span class="price-now">${rupiah(p.price)}</span></p>
    </article>`).join('');
}

/* ---------- Render: Katalog produk + filter ---------- */
const COLOR_RE = /^#[0-9a-f]{3,8}$/i;

function renderProducts(filter) {
  currentFilter = filter;
  const grid = $('productGrid');
  const list = filter === 'semua' ? PRODUCTS : PRODUCTS.filter((p) => p.gender === filter || p.category === filter);

  if (!list.length) {
    grid.innerHTML = '<p class="empty-note">Belum ada produk untuk kategori ini.</p>';
    return;
  }

  grid.innerHTML = list.map((p) => {
    const colors = String(p.colors || '').split(',').filter((c) => COLOR_RE.test(c));
    const sizes = String(p.sizes || '').split(',').filter(Boolean);
    const discount = p.old_price ? Math.round((1 - p.price / p.old_price) * 100) : 0;
    return `
      <article class="product-card reveal">
        <div class="pc-img-wrap">
          <img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">
          <span class="pc-cat-tag">${esc(p.category)}</span>
          ${discount > 0 ? `<span class="pc-discount">-${discount}%</span>` : ''}
        </div>
        <div class="pc-body">
          <h3 class="pc-name">${esc(p.name)}</h3>
          <div class="pc-price">
            <span class="now">${rupiah(p.price)}</span>
            ${p.old_price ? `<span class="old">${rupiah(p.old_price)}</span>` : ''}
          </div>
          <div class="pc-swatches">${colors.map((c) => `<span class="swatch" style="background:${c}"></span>`).join('')}</div>
          <div class="pc-sizes">${sizes.map((s) => `<span>${esc(s)}</span>`).join('')}</div>
          <a class="pc-cta" href="${esc(waLinkForProduct(p))}" target="_blank" rel="noopener">Pesan via WhatsApp</a>
        </div>
      </article>`;
  }).join('');

  watchReveal();
}

function setFilter(filter) {
  document.querySelectorAll('#filterBar .filter-btn').forEach((b) => b.classList.toggle('active', b.dataset.filter === filter));
  renderProducts(filter);
}

/* ---------- Render: Galeri & Testimoni ---------- */
function renderGallery(items) {
  const grid = $('galleryGrid');
  if (!items.length) { grid.innerHTML = '<p class="empty-note">Belum ada foto galeri.</p>'; return; }
  grid.innerHTML = items.map((g) =>
    `<img src="${esc(g.image)}" alt="${esc(g.caption || 'Foto galeri SIMPUL.')}" class="g-item reveal" loading="lazy">`).join('');
}

function renderTestimonials(items) {
  const grid = $('testiGrid');
  if (!items.length) { grid.innerHTML = '<p class="empty-note">Belum ada testimoni.</p>'; return; }
  grid.innerHTML = items.map((t) => `
    <article class="testi-card reveal">
      <div class="stars" aria-label="Rating ${t.rating} dari 5">${'★'.repeat(t.rating)}${'☆'.repeat(5 - t.rating)}</div>
      <p>"${esc(t.text)}"</p>
      <div class="testi-who"><strong>${esc(t.name)}</strong><span>${esc(t.city)}</span></div>
    </article>`).join('');
}

/* ---------- Ambil semua konten dari server ---------- */
async function loadContent() {
  $('productGrid').innerHTML = '<p class="empty-note">Memuat produk…</p>';
  try {
    const res = await fetch('/api/content');
    if (!res.ok) throw new Error('Server error');
    const data = await res.json();

    PRODUCTS = data.products;
    renderHero(data.hero);
    renderAbout(data.about);
    renderContact(data.contact);
    renderFeatured();
    renderProducts('semua');
    renderGallery(data.gallery);
    renderTestimonials(data.testimonials);
    watchReveal();
  } catch (err) {
    $('productGrid').innerHTML =
      '<p class="empty-note">Konten belum bisa dimuat. Pastikan server berjalan (npm start) dan buka lewat http://localhost:3000</p>';
  }
}
loadContent();

/* ---------- Filter bar ---------- */
$('filterBar').addEventListener('click', (e) => {
  const btn = e.target.closest('.filter-btn');
  if (btn) setFilter(btn.dataset.filter);
});

// Klik tile kategori / koleksi pria-wanita → ikut mengatur filter (scroll-nya ditangani link #produk-terbaru)
document.querySelectorAll('[data-filter]:not(.filter-btn)').forEach((el) => {
  el.addEventListener('click', () => setFilter(el.dataset.filter));
});

/* ---------- Form kontak → kirim ke server ---------- */
$('contactForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const status = $('formStatus');
  const btn = form.querySelector('button[type="submit"]');
  const fd = new FormData(form); // (hindari form.name — itu properti bawaan form, bukan input "name")

  const body = {
    name: String(fd.get('name') || '').trim(),
    email: String(fd.get('email') || '').trim(),
    message: String(fd.get('message') || '').trim(),
    website: String(fd.get('website') || '') // kolom jebakan bot
  };
  const show = (text, isError) => { status.textContent = text; status.classList.toggle('error', !!isError); };

  if (!body.name || !body.email || !body.message) return show('Lengkapi nama, email, dan pesan dulu ya.', true);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) return show('Format email belum benar.', true);

  btn.disabled = true;
  show('Mengirim…');
  try {
    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Gagal mengirim pesan.');
    form.reset();
    show('Terima kasih! Pesanmu sudah kami terima.');
  } catch (err) {
    show(err.message, true);
  }
  btn.disabled = false;
});

/* ---------- Navbar: menu mobile ---------- */
const menuToggle = $('menuToggle');
const navLinks = $('navLinks');
menuToggle.addEventListener('click', () => navLinks.classList.toggle('open'));
navLinks.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => navLinks.classList.remove('open')));

/* ---------- Navbar: tandai link aktif saat scroll ---------- */
const navAnchors = document.querySelectorAll('.nav-link');
const navObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute('id');
        navAnchors.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${id}`));
      }
    });
  },
  { rootMargin: '-45% 0px -50% 0px' }
);
document.querySelectorAll('section[id]').forEach((sec) => navObserver.observe(sec));

/* ---------- FAQ accordion ---------- */
document.querySelectorAll('.faq-item').forEach((item) => {
  item.querySelector('.faq-q').addEventListener('click', () => {
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item').forEach((i) => i.classList.remove('open'));
    if (!isOpen) item.classList.add('open');
  });
});

/* ---------- Countdown promo (sampai tengah malam) ---------- */
function updateCountdown() {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const diff = Math.max(0, end - new Date());
  const pad = (n) => String(n).padStart(2, '0');
  $('cd-h').textContent = pad(Math.floor(diff / 3600000));
  $('cd-m').textContent = pad(Math.floor((diff % 3600000) / 60000));
  $('cd-s').textContent = pad(Math.floor((diff % 60000) / 1000));
}
updateCountdown();
setInterval(updateCountdown, 1000);

/* ---------- Elemen statis yang ikut animasi reveal ---------- */
document.querySelectorAll('.cat-tile, .kg-item, .faq-item').forEach((el) => el.classList.add('reveal'));
watchReveal();

/* ---------- Bayangan navbar saat scroll ---------- */
const navbar = $('navbar');
window.addEventListener('scroll', () => {
  navbar.style.boxShadow = window.scrollY > 12 ? '0 4px 20px rgba(23,22,15,.08)' : 'none';
});
