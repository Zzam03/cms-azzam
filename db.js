/* ============================================================
   db.js — database SQLite + data awal
   File database otomatis dibuat di folder data/simpul.db
   ============================================================ */
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'simpul.db'));
db.pragma('journal_mode = WAL');

/* ---------- 1. Struktur tabel ---------- */
db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,              -- hasil bcrypt, BUKAN password asli
    created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  -- Pengaturan section (hero, about, contact) disimpan sebagai JSON per "key"
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS products (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT NOT NULL,
    gender    TEXT NOT NULL,                  -- pria | wanita
    category  TEXT NOT NULL,                  -- atasan | bawahan | outerwear | dress | aksesori
    price     INTEGER NOT NULL,
    old_price INTEGER,                        -- harga coret (boleh kosong)
    colors    TEXT NOT NULL DEFAULT '',       -- "#E4DCC8,#3C4A2C"
    sizes     TEXT NOT NULL DEFAULT '',       -- "S,M,L"
    image     TEXT NOT NULL,
    featured  INTEGER NOT NULL DEFAULT 0      -- 1 = tampil di Produk Unggulan
  );

  CREATE TABLE IF NOT EXISTS gallery (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    image   TEXT NOT NULL,
    caption TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS testimonials (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    name   TEXT NOT NULL,
    city   TEXT NOT NULL DEFAULT '',
    rating INTEGER NOT NULL DEFAULT 5,
    text   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL,
    message    TEXT NOT NULL,
    is_read    INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

/* ---------- 2. Data awal (isi landing page sebelum diedit admin) ---------- */
const img = (seed, w, h) => `https://picsum.photos/seed/${seed}/${w}/${h}`;

const DEFAULT_SETTINGS = {
  hero: {
    title: 'Busana yang\npunya *karakter*,\nbukan sekadar baju.',
    subtitle: 'SIMPUL. merancang pakaian sehari-hari dengan potongan presisi dan bahan pilihan — dijahit dari detail, dikenakan dengan cerita.',
    image: img('simpul-hero', 720, 900),
    cta_text: 'Belanja Sekarang',
    cta_link: '#koleksi'
  },
  about: {
    title: 'Dari Meja Jahit ke Lemari Kamu',
    text:
      'SIMPUL. berawal dari studio jahit kecil di rumah pada 2019. Nama "Simpul" kami pilih karena setiap pakaian pada dasarnya adalah kumpulan simpul benang — dan kami percaya setiap simpul itu bisa membawa cerita penciptanya.\n\n' +
      'Kini kami merancang, memotong, dan menjahit sendiri setiap koleksi di workshop kami, dengan bahan yang kami seleksi langsung dari pengrajin tekstil lokal.',
    image: img('simpul-about', 600, 720)
  },
  contact: {
    address: 'Jl. Rajut Simpul No. 12, Bandung, Jawa Barat',
    phone: '+62 812-3456-7890',
    email: 'halo@simpul.co.id',
    whatsapp: '6281234567890',
    instagram: 'https://instagram.com/',
    tiktok: 'https://tiktok.com/'
  }
};

// Urutan di sini = urutan tampil di website (yang pertama = paling baru)
const DEFAULT_PRODUCTS = [
  { name: 'Kemeja Linen Guntara',     gender: 'pria',   category: 'atasan',    price: 285000, old_price: null,   colors: '#E4DCC8,#3C4A2C,#7A6A50', sizes: 'S,M,L,XL',      image: img('simpul-p1', 500, 650), featured: 1 },
  { name: 'Kulot Serat Bumi',         gender: 'wanita', category: 'bawahan',   price: 245000, old_price: null,   colors: '#8A6A4C,#26241C',         sizes: 'S,M,L',         image: img('simpul-p2', 500, 650), featured: 1 },
  { name: 'Outer Rajut Sendu',        gender: 'wanita', category: 'outerwear', price: 375000, old_price: 430000, colors: '#4A5D3A,#C9BFA6',         sizes: 'M,L,XL',        image: img('simpul-p3', 500, 650), featured: 1 },
  { name: 'Dress Simpul Senja',       gender: 'wanita', category: 'dress',     price: 320000, old_price: 390000, colors: '#B4707A,#26241C',         sizes: 'S,M,L',         image: img('simpul-p4', 500, 650), featured: 0 },
  { name: 'Celana Chino Rekat',       gender: 'pria',   category: 'bawahan',   price: 265000, old_price: null,   colors: '#26241C,#7A6A50,#3C4A2C', sizes: '29,30,32,34',   image: img('simpul-p5', 500, 650), featured: 0 },
  { name: 'Jaket Canvas Perantau',    gender: 'pria',   category: 'outerwear', price: 410000, old_price: 465000, colors: '#7A6A50,#26241C',         sizes: 'M,L,XL',        image: img('simpul-p6', 500, 650), featured: 0 },
  { name: 'Blus Katun Ranting',       gender: 'wanita', category: 'atasan',    price: 195000, old_price: null,   colors: '#E4DCC8,#B4707A,#8A6A4C', sizes: 'S,M,L',         image: img('simpul-p7', 500, 650), featured: 0 },
  { name: 'Ikat Pinggang Kulit Kayu', gender: 'pria',   category: 'aksesori',  price: 135000, old_price: null,   colors: '#3C2A1E',                 sizes: 'M,L',           image: img('simpul-p8', 500, 650), featured: 0 }
];

const DEFAULT_GALLERY = [1, 2, 3, 4, 5, 6].map((n) => ({
  image: img('simpul-g' + n, 500, n % 3 === 2 ? 400 : 650),
  caption: 'Lookbook Rilis Kemarau \'26 — foto ' + n
}));

const DEFAULT_TESTIMONIALS = [
  { name: 'Ratri A.', city: 'Yogyakarta', rating: 5, text: 'Bahannya beneran adem, jahitannya rapi banget. Sudah tiga kali order dan nggak pernah kecewa.' },
  { name: 'Bagas P.', city: 'Bandung',    rating: 5, text: 'Ukurannya presisi sesuai chart, jadi nggak takut salah pilih size lagi kalau beli di sini.' },
  { name: 'Nadya F.', city: 'Surabaya',   rating: 4, text: 'Desainnya beda dari kebanyakan toko lain, terasa lebih dewasa. Pengiriman juga cepat.' }
];

/* ---------- 3. Fungsi init(): dipanggil sekali oleh server.js ---------- */
function seedContent() {
  const done = db.prepare("SELECT 1 FROM settings WHERE key = 'seeded'").get();
  if (done) return; // sudah pernah diisi → jangan timpa hasil edit admin

  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  const insertProduct = db.prepare(
    `INSERT INTO products (name, gender, category, price, old_price, colors, sizes, image, featured)
     VALUES (@name, @gender, @category, @price, @old_price, @colors, @sizes, @image, @featured)`
  );
  const insertGallery = db.prepare('INSERT INTO gallery (image, caption) VALUES (@image, @caption)');
  const insertTesti = db.prepare('INSERT INTO testimonials (name, city, rating, text) VALUES (@name, @city, @rating, @text)');

  // transaction = semua berhasil atau semua dibatalkan
  db.transaction(() => {
    Object.entries(DEFAULT_SETTINGS).forEach(([k, v]) => insertSetting.run(k, JSON.stringify(v)));
    // dibalik supaya item pertama di daftar mendapat id terbesar (= tampil paling atas)
    [...DEFAULT_PRODUCTS].reverse().forEach((p) => insertProduct.run(p));
    [...DEFAULT_GALLERY].reverse().forEach((g) => insertGallery.run(g));
    [...DEFAULT_TESTIMONIALS].reverse().forEach((t) => insertTesti.run(t));
    insertSetting.run('seeded', '1');
  })();
  console.log('Konten awal landing page berhasil dibuat.');
}

function seedAdmin() {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM admins').get();
  if (n > 0) return; // admin sudah ada

  const { ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_USERNAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error('Belum ada akun admin. Isi ADMIN_USERNAME, ADMIN_EMAIL, dan ADMIN_PASSWORD di file .env lalu jalankan ulang.');
  }
  if (ADMIN_PASSWORD.length < 8) {
    throw new Error('ADMIN_PASSWORD minimal 8 karakter.');
  }

  // Password TIDAK pernah disimpan asli — hanya hash bcrypt-nya (cost 12)
  const hash = bcrypt.hashSync(ADMIN_PASSWORD, 12);
  db.prepare('INSERT INTO admins (username, email, password_hash) VALUES (?, ?, ?)')
    .run(ADMIN_USERNAME.trim(), ADMIN_EMAIL.trim().toLowerCase(), hash);
  console.log(`Akun admin pertama dibuat: "${ADMIN_USERNAME.trim()}". Setelah ini ADMIN_PASSWORD di .env boleh dihapus.`);
}

function init() {
  seedContent();
  seedAdmin();
}

module.exports = { db, init };
