# SIMPUL. — Landing Page Toko Baju + Halaman Admin (CMS)

Landing page toko baju yang kontennya bisa dikelola lewat halaman admin, tanpa mengedit kode.

**Teknologi:** HTML, CSS, JavaScript (frontend) · Node.js + Express (backend) · SQLite (database) · bcrypt (hash password) · JWT di cookie httpOnly (sesi login) · Multer (upload gambar)

---

## 1. Struktur Folder

```
simpul-cms/
├── server.js            ← backend: login, API, upload, pesan (file terpenting)
├── db.js                ← pembuatan tabel database + data awal
├── reset-password.js    ← alat bantu kalau lupa password admin
├── package.json         ← daftar library yang dipakai
├── .env.example         ← contoh pengaturan rahasia (salin jadi .env)
├── public/              ← LANDING PAGE (yang dilihat pengunjung)
│   ├── index.html
│   ├── style.css
│   └── script.js        ← mengambil konten dari /api/content
├── admin/               ← HALAMAN ADMIN
│   ├── login.html       ← /admin/login
│   ├── index.html       ← /admin (dashboard)
│   └── assets/ (admin.css, admin.js, login.js)
├── uploads/             ← gambar hasil upload (dibuat otomatis)
└── data/                ← file database simpul.db (dibuat otomatis)
```

## 2. Cara Menjalankan

1. Install **Node.js versi LTS** dari https://nodejs.org (cek dengan `node -v`, minimal 18).
2. Buka terminal di folder project, lalu pasang library:
   ```bash
   npm install
   ```
3. Buat file pengaturan:
   ```bash
   cp .env.example .env        # Windows (cmd): copy .env.example .env
   ```
   Lalu buka `.env` dan isi:
   - `JWT_SECRET` → teks acak panjang. Cara membuatnya:
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `ADMIN_PASSWORD` → password admin pertama (minimal 8 karakter)
4. Jalankan:
   ```bash
   npm start
   ```
5. Buka di browser:
   - Website: **http://localhost:3000**
   - Admin: **http://localhost:3000/admin/login**

> ⚠️ Buka lewat `localhost:3000`, **bukan** lewat Live Server VS Code (`127.0.0.1:5500`) dan bukan dengan klik dua kali `index.html`. Backend hanya jalan lewat `npm start`.

**Lupa password?** `node reset-password.js admin PasswordBaru123`

## 3. Cara Pakai Admin

| Menu admin | Mengatur bagian landing page |
|---|---|
| Dashboard | Ringkasan: jumlah produk, galeri, testimoni, pesan (total & belum dibaca) |
| Hero | Judul, subtitle, gambar, teks & link tombol di bagian paling atas |
| Tentang Brand | Judul, teks (pisahkan paragraf dengan baris kosong), gambar |
| Produk | **CRUD** produk (nama, harga, harga coret/diskon, warna, ukuran, foto, unggulan) |
| Galeri | **CRUD** foto galeri + upload |
| Testimoni | **CRUD** testimoni pelanggan |
| Info Kontak | Alamat, telepon, email, nomor WhatsApp, Instagram, TikTok (dipakai di bagian kontak, footer, dan semua tombol WhatsApp) |
| Pesan Masuk | Pesan dari form kontak: tandai dibaca/belum, hapus |

Tips judul hero: apit kata dengan `*bintang*` agar tampil miring berwarna, mis. `punya *karakter*`.

## 4. Pemetaan ke Soal Tugas

| Syarat tugas | Dikerjakan di |
|---|---|
| Login page `/admin/login`, input username/email + password | `admin/login.html`, `POST /api/admin/login` |
| Validasi ke database | query tabel `admins` (cocokkan username **atau** email) |
| Session/JWT | JWT disimpan di cookie `httpOnly`, berlaku 8 jam |
| Logout | tombol "Keluar" → `POST /api/admin/logout` |
| Password di-hash | bcrypt (cost 12), `db.js` & `server.js` |
| Redirect ke dashboard jika sudah login | rute `GET /admin/login` di `server.js` |
| Dashboard `/admin` + ringkasan + sidebar | `admin/index.html`, `viewDashboard()` |
| Hero, About, Contact Info (edit) | menu Hero, Tentang Brand, Info Kontak |
| Services/Layanan (CRUD) | **Produk** (layanan toko baju = produk) |
| Portfolio/Galeri (CRUD + upload) | menu Galeri |
| Testimoni (CRUD) | menu Testimoni |
| Pesan kontak: lihat, tandai dibaca, hapus | menu Pesan Masuk + form di landing page |
| Upload JPG/PNG/WEBP, validasi ukuran & tipe, simpan ke `uploads/` | `POST /api/admin/upload` (maks. 2 MB, tipe dicek dari isi file) |

## 5. Keamanan (poin untuk presentasi)

- Password **tidak pernah disimpan asli**, hanya hash bcrypt.
- Cookie login `httpOnly` (tidak bisa dibaca JavaScript) + `sameSite=strict` (anti-CSRF).
- Semua API admin dijaga `requireAuth`; tanpa login → 401.
- Batas percobaan login (8x gagal → blokir 15 menit) dan batas kirim pesan (5 per 10 menit).
- Semua query SQL memakai parameter terikat (anti SQL injection).
- Semua teks dari database di-escape sebelum ditampilkan (anti XSS); URL gambar/link hanya menerima `http(s)`, `/uploads/…`, atau `#anchor` (menolak `javascript:`).
- Upload: nama file diacak, tipe file diperiksa dari isinya (bukan dari nama), maks. 2 MB.
- Form kontak punya kolom jebakan (honeypot) untuk bot.

## 6. Upload ke GitHub (branch baru)

```bash
git checkout -b fitur-admin        # buat & pindah ke branch baru
git add .
git commit -m "Tambah halaman admin (CMS)"
git push -u origin fitur-admin
```

`.gitignore` sudah mengecualikan `.env`, `node_modules/`, `data/`, dan isi `uploads/` — **jangan pernah** meng-upload `.env` ke GitHub.

> ⚠️ **GitHub Pages tidak bisa menjalankan project ini**, karena Pages hanya untuk file statis (HTML/CSS/JS) sedangkan admin butuh server Node + database. Untuk presentasi cukup jalankan di laptop (`npm start`). Kalau ingin online, perlu hosting yang mendukung Node.js (mis. Render, Railway, VPS). Karena memakai SQLite dan folder `uploads/`, pilih paket hosting yang punya penyimpanan permanen (disk gratis di beberapa layanan bisa terhapus saat restart). Saat di hosting, set `NODE_ENV=production` dan pakai HTTPS.

## 7. Masalah Umum

| Gejala | Solusi |
|---|---|
| Error saat `npm install` di `better-sqlite3` | Pakai Node.js versi LTS (20 atau 22). Di Windows, kadang perlu "Visual Studio Build Tools" bila tidak ada file siap-pakai untuk versi Node kamu |
| "JWT_SECRET … wajib diisi" | File `.env` belum dibuat / `JWT_SECRET` masih kosong |
| "Belum ada akun admin…" | Isi `ADMIN_PASSWORD` di `.env` lalu jalankan ulang |
| Port 3000 sudah dipakai | Ganti `PORT=3001` di `.env` |
| Produk tidak muncul, ada tulisan "Konten belum bisa dimuat" | Server belum jalan, atau halaman dibuka lewat Live Server. Jalankan `npm start` dan buka `localhost:3000` |
| Gambar produk bawaan masih foto acak | Itu placeholder (picsum.photos). Ganti lewat menu Produk → Edit → upload foto asli |
