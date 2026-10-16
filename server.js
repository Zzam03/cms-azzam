/* ============================================================
   server.js — backend landing page SIMPUL. + halaman admin
   Jalankan dengan:  npm start
   ============================================================ */
require('dotenv').config(); // baca file .env

const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { db, init } = require('./db');

const PORT = Number(process.env.PORT) || 3000;
const JWT_SECRET = process.env.JWT_SECRET || '';
const IS_PROD = process.env.NODE_ENV === 'production';
const UPLOAD_DIR = path.join(__dirname, 'uploads');

if (JWT_SECRET.length < 32) {
  console.error('JWT_SECRET di file .env wajib diisi (minimal 32 karakter acak). Lihat README.md.');
  process.exit(1);
}
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
try {
  init();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');
if (IS_PROD) app.set('trust proxy', 1); // supaya req.ip benar saat di belakang proxy hosting

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin'
  });
  next();
});
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

/* ============================================================
   Helper: validasi & pembersihan input
   ============================================================ */
const GENDERS = ['pria', 'wanita'];
const CATEGORIES = ['atasan', 'bawahan', 'outerwear', 'dress', 'aksesori'];

// ubah apa pun jadi string, buang spasi pinggir, potong sesuai batas panjang
const clean = (v, max) => String(v ?? '').trim().slice(0, max);

const parseId = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/**
 * Cek URL aman. Kembalikan string (boleh kosong) kalau valid, atau null kalau tidak.
 * Hanya mengizinkan: file hasil upload (/uploads/...), http(s)://..., dan (opsional) anchor/path.
 * Ini mencegah "javascript:..." dan sejenisnya masuk ke database.
 */
function safeUrl(v, { allowAnchor = false } = {}) {
  const s = clean(v, 500);
  if (s === '') return s;
  if (/^\/uploads\/[a-f0-9]{24}\.(jpg|png|webp)$/.test(s)) return s;
  if (/^https?:\/\/[^\s"'<>]+$/i.test(s)) return s;
  if (allowAnchor && /^[#/][^\s"'<>]*$/.test(s)) return s;
  return null;
}

// "0812-3456-7890" / "+62 812..." → "628123456789"
function normalizeWa(v) {
  let d = String(v ?? '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '62' + d.slice(1);
  return d;
}

const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;

/* ============================================================
   Rate limiter sederhana (di memori) — anti brute-force & spam
   ============================================================ */
function makeLimiter(max, windowMs) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, r] of hits) if (r.reset <= now) hits.delete(k);
  }, 60 * 1000).unref();
  return {
    blocked(key) {
      const r = hits.get(key);
      return !!r && r.reset > Date.now() && r.count >= max;
    },
    hit(key) {
      const now = Date.now();
      const r = hits.get(key);
      if (!r || r.reset <= now) hits.set(key, { count: 1, reset: now + windowMs });
      else r.count++;
    },
    clear(key) {
      hits.delete(key);
    }
  };
}
const loginLimiter = makeLimiter(8, 15 * 60 * 1000);   // 8 login gagal / 15 menit / IP
const messageLimiter = makeLimiter(5, 10 * 60 * 1000); // 5 pesan / 10 menit / IP

/* ============================================================
   Autentikasi: JWT disimpan di cookie httpOnly
   (httpOnly = tidak bisa dibaca JavaScript di browser → lebih aman dari XSS)
   ============================================================ */
const DUMMY_HASH = bcrypt.hashSync('password-palsu-untuk-timing', 12);

function currentAdmin(req) {
  const token = req.cookies && req.cookies.token;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    // pastikan akun admin-nya masih ada di database
    return db.prepare('SELECT id, username, email FROM admins WHERE id = ?').get(payload.id) || null;
  } catch {
    return null; // token salah / kedaluwarsa
  }
}

function requireAuth(req, res, next) {
  const admin = currentAdmin(req);
  if (!admin) return res.status(401).json({ error: 'Sesi berakhir, silakan login lagi.' });
  req.admin = admin;
  next();
}

app.post('/api/admin/login', (req, res) => {
  const key = req.ip;
  if (loginLimiter.blocked(key)) {
    return res.status(429).json({ error: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.' });
  }

  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
    return res.status(400).json({ error: 'Username/email dan password wajib diisi.' });
  }

  // Validasi ke database: cocokkan username ATAU email
  const id = username.trim();
  const admin = db.prepare('SELECT * FROM admins WHERE username = ? OR email = ?').get(id, id.toLowerCase());

  // Selalu jalankan bcrypt (pakai hash palsu bila akun tidak ada) agar waktu respon tidak membocorkan
  // apakah username tersebut terdaftar.
  const ok = bcrypt.compareSync(password, admin ? admin.password_hash : DUMMY_HASH);
  if (!admin || !ok) {
    loginLimiter.hit(key);
    return res.status(401).json({ error: 'Username/email atau password salah.' });
  }

  loginLimiter.clear(key);
  const token = jwt.sign({ id: admin.id }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '8h' });
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'strict', // cookie tidak ikut terkirim dari situs lain (anti-CSRF)
    secure: IS_PROD,    // di production wajib HTTPS
    maxAge: 8 * 60 * 60 * 1000
  });
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('token', { httpOnly: true, sameSite: 'strict', secure: IS_PROD });
  res.json({ ok: true });
});

app.get('/api/admin/me', requireAuth, (req, res) => {
  res.json({ username: req.admin.username, email: req.admin.email });
});

/* ============================================================
   Halaman admin (HTML)
   ============================================================ */
// Sudah login → langsung lempar ke dashboard
app.get('/admin/login', (req, res) => {
  if (currentAdmin(req)) return res.redirect('/admin');
  res.sendFile(path.join(__dirname, 'admin', 'login.html'));
});

// Belum login → lempar ke halaman login
app.get('/admin', (req, res) => {
  if (!currentAdmin(req)) return res.redirect('/admin/login');
  res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

// CSS & JS admin (tidak rahasia; data aslinya tetap dilindungi requireAuth di API)
app.use('/admin-assets', express.static(path.join(__dirname, 'admin', 'assets')));

/* ============================================================
   Pengaturan section: hero, about, contact
   ============================================================ */
function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? JSON.parse(row.value) : {};
}
function setSetting(key, obj) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, JSON.stringify(obj));
}

// Tiap section punya aturan validasinya sendiri. Hanya field yang terdaftar di sini yang diterima.
const SETTING_PARSERS = {
  hero(b) {
    const title = clean(b.title, 200);
    const subtitle = clean(b.subtitle, 500);
    const cta_text = clean(b.cta_text, 40);
    const image = safeUrl(b.image);
    const cta_link = safeUrl(b.cta_link, { allowAnchor: true });
    if (!title) return { error: 'Judul hero wajib diisi.' };
    if (image === null) return { error: 'Gambar harus berupa hasil upload atau URL http(s).' };
    if (cta_link === null) return { error: 'Link tombol harus berupa #section, /halaman, atau URL http(s).' };
    return { data: { title, subtitle, image, cta_text, cta_link } };
  },
  about(b) {
    const title = clean(b.title, 150);
    const text = clean(b.text, 3000);
    const image = safeUrl(b.image);
    if (!title) return { error: 'Judul wajib diisi.' };
    if (image === null) return { error: 'Gambar harus berupa hasil upload atau URL http(s).' };
    return { data: { title, text, image } };
  },
  contact(b) {
    const address = clean(b.address, 300);
    const phone = clean(b.phone, 40);
    const email = clean(b.email, 120).toLowerCase();
    const whatsapp = normalizeWa(b.whatsapp);
    const instagram = safeUrl(b.instagram);
    const tiktok = safeUrl(b.tiktok);
    if (email && !EMAIL_RE.test(email)) return { error: 'Format email tidak valid.' };
    if (whatsapp && (whatsapp.length < 9 || whatsapp.length > 15)) return { error: 'Nomor WhatsApp tidak valid.' };
    if (instagram === null || tiktok === null || (instagram && !/^https?:/i.test(instagram)) || (tiktok && !/^https?:/i.test(tiktok))) {
      return { error: 'Link Instagram/TikTok harus diawali http:// atau https://' };
    }
    return { data: { address, phone, email, whatsapp, instagram, tiktok } };
  }
};

app.get('/api/admin/settings/:key', requireAuth, (req, res) => {
  if (!SETTING_PARSERS[req.params.key]) return res.status(404).json({ error: 'Pengaturan tidak ditemukan.' });
  res.json(getSetting(req.params.key));
});

app.put('/api/admin/settings/:key', requireAuth, (req, res) => {
  const parser = SETTING_PARSERS[req.params.key];
  if (!parser) return res.status(404).json({ error: 'Pengaturan tidak ditemukan.' });
  const { error, data } = parser(req.body || {});
  if (error) return res.status(400).json({ error });
  setSetting(req.params.key, data);
  res.json(data);
});

/* ============================================================
   CRUD: produk, galeri, testimoni
   registerCrud() membuat 4 endpoint sekaligus: GET (daftar), POST (tambah), PUT (ubah), DELETE (hapus).
   Nama tabel/kolom berasal dari kode ini (bukan dari input user), dan semua NILAI dikirim lewat
   parameter terikat (@nama) sehingga aman dari SQL injection.
   ============================================================ */
function registerCrud(route, table, parse, orderBy) {
  const base = `/api/admin/${route}`;

  app.get(base, requireAuth, (req, res) => {
    res.json(db.prepare(`SELECT * FROM ${table} ORDER BY ${orderBy}`).all());
  });

  app.post(base, requireAuth, (req, res) => {
    const { error, data } = parse(req.body || {});
    if (error) return res.status(400).json({ error });
    const cols = Object.keys(data);
    const info = db
      .prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((c) => '@' + c).join(', ')})`)
      .run(data);
    res.status(201).json(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(info.lastInsertRowid));
  });

  app.put(`${base}/:id`, requireAuth, (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID tidak valid.' });
    const { error, data } = parse(req.body || {});
    if (error) return res.status(400).json({ error });
    const sets = Object.keys(data).map((c) => `${c} = @${c}`).join(', ');
    const info = db.prepare(`UPDATE ${table} SET ${sets} WHERE id = @id`).run({ ...data, id });
    if (!info.changes) return res.status(404).json({ error: 'Data tidak ditemukan.' });
    res.json(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id));
  });

  app.delete(`${base}/:id`, requireAuth, (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID tidak valid.' });
    const info = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
    if (!info.changes) return res.status(404).json({ error: 'Data tidak ditemukan.' });
    res.json({ ok: true });
  });
}

function parseProduct(b) {
  const name = clean(b.name, 100);
  const gender = clean(b.gender, 20);
  const category = clean(b.category, 20);
  const price = Number(b.price);
  const old_price = b.old_price === '' || b.old_price == null ? null : Number(b.old_price);
  const image = safeUrl(b.image);

  if (!name) return { error: 'Nama produk wajib diisi.' };
  if (!GENDERS.includes(gender)) return { error: 'Pilih koleksi pria atau wanita.' };
  if (!CATEGORIES.includes(category)) return { error: 'Kategori tidak valid.' };
  if (!Number.isInteger(price) || price < 0 || price > 100000000) return { error: 'Harga harus berupa angka bulat (rupiah).' };
  if (old_price !== null) {
    if (!Number.isInteger(old_price) || old_price <= price) return { error: 'Harga coret harus angka bulat dan lebih besar dari harga jual.' };
  }
  if (!image) return { error: 'Gambar produk wajib diisi (upload atau URL http/https).' };

  // Warna: daftar kode hex dipisah koma. Divalidasi ketat karena nanti dipakai di atribut style.
  const colorList = clean(b.colors, 200).split(',').map((c) => c.trim()).filter(Boolean);
  if (colorList.some((c) => !/^#[0-9a-fA-F]{3,8}$/.test(c))) {
    return { error: 'Warna harus berupa kode hex dipisah koma, contoh: #E4DCC8, #3C4A2C' };
  }
  const sizeList = clean(b.sizes, 100).split(',').map((s) => s.trim()).filter(Boolean);
  if (sizeList.some((s) => !/^[A-Za-z0-9]{1,6}$/.test(s))) {
    return { error: 'Ukuran dipisah koma, contoh: S, M, L, XL (maks. 6 karakter).' };
  }

  return {
    data: {
      name, gender, category, price, old_price, image,
      colors: colorList.join(','),
      sizes: sizeList.join(','),
      featured: b.featured === true || b.featured === 1 || b.featured === '1' ? 1 : 0
    }
  };
}

function parseGallery(b) {
  const image = safeUrl(b.image);
  if (!image) return { error: 'Gambar wajib diisi (upload atau URL http/https).' };
  return { data: { image, caption: clean(b.caption, 150) } };
}

function parseTestimonial(b) {
  const name = clean(b.name, 60);
  const text = clean(b.text, 500);
  const rating = Number(b.rating);
  if (!name) return { error: 'Nama wajib diisi.' };
  if (!text) return { error: 'Isi testimoni wajib diisi.' };
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: 'Rating harus 1 sampai 5.' };
  return { data: { name, city: clean(b.city, 60), rating, text } };
}

registerCrud('products', 'products', parseProduct, 'id DESC');
registerCrud('gallery', 'gallery', parseGallery, 'id DESC');
registerCrud('testimonials', 'testimonials', parseTestimonial, 'id DESC');

/* ============================================================
   Pesan kontak
   ============================================================ */
// Publik: dikirim dari form di landing page
app.post('/api/messages', (req, res) => {
  const b = req.body || {};
  if (b.website) return res.status(201).json({ ok: true }); // kolom jebakan (honeypot) terisi → bot, pura-pura sukses

  if (messageLimiter.blocked(req.ip)) {
    return res.status(429).json({ error: 'Terlalu banyak pesan. Coba lagi beberapa menit lagi.' });
  }
  const name = clean(b.name, 80);
  const email = clean(b.email, 120).toLowerCase();
  const message = clean(b.message, 2000);
  if (!name || !email || !message) return res.status(400).json({ error: 'Nama, email, dan pesan wajib diisi.' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Format email tidak valid.' });

  messageLimiter.hit(req.ip);
  db.prepare('INSERT INTO messages (name, email, message) VALUES (?, ?, ?)').run(name, email, message);
  res.status(201).json({ ok: true });
});

// Admin
app.get('/api/admin/messages', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM messages ORDER BY id DESC').all());
});

app.patch('/api/admin/messages/:id', requireAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID tidak valid.' });
  const isRead = req.body && req.body.is_read ? 1 : 0;
  const info = db.prepare('UPDATE messages SET is_read = ? WHERE id = ?').run(isRead, id);
  if (!info.changes) return res.status(404).json({ error: 'Pesan tidak ditemukan.' });
  res.json({ ok: true, is_read: isRead });
});

app.delete('/api/admin/messages/:id', requireAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID tidak valid.' });
  const info = db.prepare('DELETE FROM messages WHERE id = ?').run(id);
  if (!info.changes) return res.status(404).json({ error: 'Pesan tidak ditemukan.' });
  res.json({ ok: true });
});

/* ============================================================
   Dashboard: ringkasan
   ============================================================ */
app.get('/api/admin/stats', requireAuth, (req, res) => {
  const count = (sql) => db.prepare(sql).get().n;
  res.json({
    products: count('SELECT COUNT(*) AS n FROM products'),
    featured: count('SELECT COUNT(*) AS n FROM products WHERE featured = 1'),
    gallery: count('SELECT COUNT(*) AS n FROM gallery'),
    testimonials: count('SELECT COUNT(*) AS n FROM testimonials'),
    messages: count('SELECT COUNT(*) AS n FROM messages'),
    unread: count('SELECT COUNT(*) AS n FROM messages WHERE is_read = 0'),
    recent: db.prepare('SELECT id, name, email, message, is_read, created_at FROM messages ORDER BY id DESC LIMIT 5').all()
  });
});

/* ============================================================
   Upload gambar (JPG / PNG / WEBP, maks. 2 MB)
   ============================================================ */
const upload = multer({
  storage: multer.memoryStorage(), // file ditahan di memori dulu, kita periksa isinya sebelum disimpan
  limits: { fileSize: 2 * 1024 * 1024, files: 1 }
});

// Cek tipe file dari ISI-nya (magic bytes), bukan dari nama/ekstensi yang bisa dipalsukan
function detectImageType(buf) {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 12 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

app.post('/api/admin/upload', requireAuth, (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Ukuran file maksimal 2 MB.' : 'Upload gagal, coba lagi.';
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: 'Pilih file gambar terlebih dahulu.' });

    const ext = path.extname(req.file.originalname).toLowerCase();
    const type = detectImageType(req.file.buffer);
    if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext) || !type) {
      return res.status(400).json({ error: 'Format tidak didukung. Gunakan JPG, PNG, atau WEBP.' });
    }

    // Nama file diacak → tidak bisa ditebak & tidak bisa menimpa file lain
    const filename = crypto.randomBytes(12).toString('hex') + '.' + type;
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), req.file.buffer);
    res.status(201).json({ url: '/uploads/' + filename });
  });
});

/* ============================================================
   API publik untuk landing page
   ============================================================ */
app.get('/api/content', (req, res) => {
  res.set('Cache-Control', 'no-store'); // perubahan dari admin langsung terlihat
  res.json({
    hero: getSetting('hero'),
    about: getSetting('about'),
    contact: getSetting('contact'),
    products: db.prepare('SELECT * FROM products ORDER BY id DESC').all(),
    gallery: db.prepare('SELECT * FROM gallery ORDER BY id DESC').all(),
    testimonials: db.prepare('SELECT * FROM testimonials ORDER BY id DESC').all()
  });
});

/* ============================================================
   File statis: gambar upload & landing page
   ============================================================ */
app.use('/uploads', express.static(UPLOAD_DIR, { index: false, maxAge: '7d' }));
app.use(express.static(path.join(__dirname, 'public')));

/* ---------- 404 & error handler ---------- */
app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan.' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Format data tidak valid.' });
  console.error(err);
  res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
});

app.listen(PORT, () => {
  console.log(`Website : http://localhost:${PORT}`);
  console.log(`Admin   : http://localhost:${PORT}/admin/login`);
});
