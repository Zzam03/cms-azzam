/* ============================================================
   admin.js — logika dashboard admin
   Satu halaman (index.html) yang isinya berganti sesuai #hash di URL:
   #dashboard, #hero, #about, #produk, #galeri, #testimoni, #kontak, #pesan
   ============================================================ */
(() => {
  'use strict';

  /* ---------- Helper kecil ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);

  // Escape HTML: mencegah teks dari database dianggap kode HTML (anti-XSS)
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const rupiah = (n) => 'Rp' + Number(n).toLocaleString('id-ID');
  const fmtDate = (s) =>
    new Date(String(s).replace(' ', 'T') + 'Z').toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

  // Pembungkus fetch: kirim cookie login, ubah body ke JSON, tangani error & sesi habis
  async function api(url, options = {}) {
    const opts = { credentials: 'same-origin', ...options, headers: { ...(options.headers || {}) } };
    if (opts.body && !(opts.body instanceof FormData)) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    const res = await fetch(url, opts);
    if (res.status === 401) {
      window.location.href = '/admin/login';
      throw new Error('Sesi berakhir, silakan login lagi.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Terjadi kesalahan.');
    return data;
  }

  let toastTimer;
  function toast(message, isError = false) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.toggle('error', isError);
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }

  /* ---------- Definisi form (satu tempat untuk semua field) ---------- */
  const SETTING_FORMS = {
    hero: {
      desc: 'Bagian paling atas website: judul besar, kalimat pembuka, foto, dan tombol utama.',
      fields: [
        { name: 'title', label: 'Judul', type: 'textarea', rows: 3, required: true, max: 200,
          hint: 'Tekan Enter untuk ganti baris. Apit kata dengan *bintang* agar tampil miring berwarna, contoh: punya *karakter*' },
        { name: 'subtitle', label: 'Subtitle', type: 'textarea', rows: 3, max: 500 },
        { name: 'image', label: 'Gambar hero', type: 'image' },
        { name: 'cta_text', label: 'Teks tombol (CTA)', max: 40 },
        { name: 'cta_link', label: 'Link tombol', max: 500, hint: 'Contoh: #koleksi atau #produk-terbaru atau https://...' }
      ]
    },
    about: {
      desc: 'Cerita singkat tentang brand. Pisahkan paragraf dengan satu baris kosong.',
      fields: [
        { name: 'title', label: 'Judul', required: true, max: 150 },
        { name: 'text', label: 'Teks', type: 'textarea', rows: 8, max: 3000 },
        { name: 'image', label: 'Gambar', type: 'image' }
      ]
    },
    contact: {
      desc: 'Dipakai di bagian kontak, footer, dan tombol WhatsApp di seluruh website.',
      fields: [
        { name: 'address', label: 'Alamat', type: 'textarea', rows: 2, max: 300 },
        { name: 'phone', label: 'Telepon (tampilan)', max: 40 },
        { name: 'email', label: 'Email', max: 120 },
        { name: 'whatsapp', label: 'Nomor WhatsApp', max: 20, hint: 'Boleh ditulis 0812… atau +62812…, otomatis diubah ke format 62812…' },
        { name: 'instagram', label: 'Link Instagram', max: 300, hint: 'Diawali https://' },
        { name: 'tiktok', label: 'Link TikTok', max: 300, hint: 'Diawali https://' }
      ]
    }
  };

  const CRUD = {
    produk: {
      api: 'products', title: 'Produk',
      desc: 'Daftar produk yang tampil di Katalog. Centang "Unggulan" untuk menampilkannya di Produk Unggulan (3 produk terbaru yang dicentang).',
      empty: 'Belum ada produk. Klik "+ Tambah" untuk membuat yang pertama.',
      fields: [
        { name: 'name', label: 'Nama produk', required: true, max: 100 },
        { name: 'gender', label: 'Koleksi', type: 'select', options: ['pria', 'wanita'], default: 'wanita' },
        { name: 'category', label: 'Kategori', type: 'select', options: ['atasan', 'bawahan', 'outerwear', 'dress', 'aksesori'], default: 'atasan' },
        { name: 'price', label: 'Harga jual (Rp)', type: 'number', required: true },
        { name: 'old_price', label: 'Harga coret (Rp)', type: 'number', hint: 'Isi hanya jika sedang diskon (harus lebih besar dari harga jual). Persen diskon dihitung otomatis.' },
        { name: 'colors', label: 'Warna', max: 200, hint: 'Kode hex dipisah koma. Contoh: #E4DCC8, #3C4A2C' },
        { name: 'sizes', label: 'Ukuran', max: 100, hint: 'Dipisah koma. Contoh: S, M, L, XL' },
        { name: 'image', label: 'Foto produk', type: 'image', required: true },
        { name: 'featured', label: 'Unggulan — tampilkan di bagian Produk Unggulan', type: 'checkbox' }
      ],
      columns: [
        { label: 'Foto', render: (r) => `<img class="thumb" src="${esc(r.image)}" alt="">` },
        { label: 'Produk', render: (r) =>
            `<strong>${esc(r.name)}</strong><br><span class="tag">${esc(r.gender)}</span><span class="tag">${esc(r.category)}</span>` +
            (r.featured ? '<span class="tag star">Unggulan</span>' : '') },
        { label: 'Harga', render: (r) => rupiah(r.price) + (r.old_price ? `<span class="old">${rupiah(r.old_price)}</span>` : '') },
        { label: 'Warna', render: (r) =>
            '<div class="dots">' +
            r.colors.split(',').filter((c) => /^#[0-9a-f]{3,8}$/i.test(c)).map((c) => `<span class="dot" style="background:${c}"></span>`).join('') +
            '</div>' },
        { label: 'Ukuran', render: (r) => esc(r.sizes.split(',').join(' · ')) }
      ]
    },
    galeri: {
      api: 'gallery', title: 'Foto Galeri',
      desc: 'Foto yang tampil di bagian Galeri Fashion (foto terbaru di atas).',
      empty: 'Belum ada foto galeri.',
      fields: [
        { name: 'image', label: 'Foto', type: 'image', required: true },
        { name: 'caption', label: 'Keterangan foto', max: 150, hint: 'Dipakai sebagai teks alternatif gambar (membantu pembaca layar & SEO).' }
      ],
      columns: [
        { label: 'Foto', render: (r) => `<img class="thumb" src="${esc(r.image)}" alt="">` },
        { label: 'Keterangan', render: (r) => esc(r.caption) || '<em>—</em>' }
      ]
    },
    testimoni: {
      api: 'testimonials', title: 'Testimoni',
      desc: 'Ulasan pelanggan di bagian Testimonial.',
      empty: 'Belum ada testimoni.',
      fields: [
        { name: 'name', label: 'Nama pelanggan', required: true, max: 60 },
        { name: 'city', label: 'Kota', max: 60 },
        { name: 'rating', label: 'Rating (1–5)', type: 'select', options: ['5', '4', '3', '2', '1'], default: '5' },
        { name: 'text', label: 'Isi testimoni', type: 'textarea', rows: 4, required: true, max: 500 }
      ],
      columns: [
        { label: 'Nama', render: (r) => `<strong>${esc(r.name)}</strong><br><small>${esc(r.city)}</small>` },
        { label: 'Rating', render: (r) => '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating) },
        { label: 'Isi', render: (r) => esc(r.text.length > 90 ? r.text.slice(0, 90) + '…' : r.text) }
      ]
    }
  };

  /* ---------- Membuat & membaca field form ---------- */
  function fieldHtml(f, value) {
    const v = value ?? '';
    const id = 'f_' + f.name;
    const hint = f.hint ? `<small>${esc(f.hint)}</small>` : '';
    const label = `<label for="${id}">${esc(f.label)}${f.required ? ' <i>*</i>' : ''}</label>`;
    const maxAttr = f.max ? ` maxlength="${f.max}"` : '';
    let input;

    if (f.type === 'checkbox') {
      return `<div class="field field-check"><label><input type="checkbox" name="${f.name}"${v ? ' checked' : ''}> ${esc(f.label)}</label>${hint}</div>`;
    }
    if (f.type === 'textarea') {
      input = `<textarea id="${id}" name="${f.name}" rows="${f.rows || 4}"${maxAttr}>${esc(v)}</textarea>`;
    } else if (f.type === 'select') {
      input = `<select id="${id}" name="${f.name}">` +
        f.options.map((o) => `<option value="${esc(o)}"${String(o) === String(v) ? ' selected' : ''}>${esc(o)}</option>`).join('') +
        '</select>';
    } else if (f.type === 'image') {
      input =
        `<div class="img-field">` +
          `<input id="${id}" name="${f.name}" type="text" value="${esc(v)}" placeholder="Upload di bawah, atau tempel URL https://…">` +
          `<div class="img-row"><input type="file" accept="image/jpeg,image/png,image/webp" data-upload><span class="up-status">JPG/PNG/WEBP, maks. 2 MB</span></div>` +
          `<img class="img-preview" alt="Pratinjau gambar"${v ? ` src="${esc(v)}"` : ' hidden'}>` +
        `</div>`;
    } else {
      input = `<input id="${id}" name="${f.name}" type="${f.type || 'text'}" value="${esc(v)}"${maxAttr}${f.type === 'number' ? ' min="0" step="1"' : ''}>`;
    }
    return `<div class="field">${label}${input}${hint}</div>`;
  }

  // Aktifkan tombol upload + pratinjau untuk semua field gambar di dalam "root"
  function bindImageFields(root) {
    root.querySelectorAll('.img-field').forEach((wrap) => {
      const urlInput = $('input[type="text"]', wrap);
      const fileInput = $('input[type="file"]', wrap);
      const status = $('.up-status', wrap);
      const preview = $('.img-preview', wrap);

      const updatePreview = () => {
        if (urlInput.value.trim()) { preview.src = urlInput.value.trim(); preview.hidden = false; }
        else { preview.hidden = true; }
      };
      urlInput.addEventListener('input', updatePreview);

      fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) { status.textContent = 'Ukuran file maksimal 2 MB.'; fileInput.value = ''; return; }
        status.textContent = 'Mengunggah…';
        const fd = new FormData();
        fd.append('image', file);
        try {
          const r = await api('/api/admin/upload', { method: 'POST', body: fd });
          urlInput.value = r.url;
          updatePreview();
          status.textContent = 'Berhasil diunggah ✓';
        } catch (err) {
          status.textContent = err.message;
        }
        fileInput.value = '';
      });
    });
  }

  function readForm(form, fields) {
    const out = {};
    fields.forEach((f) => {
      const el = form.elements[f.name];
      out[f.name] = f.type === 'checkbox' ? el.checked : el.value;
    });
    return out;
  }

  /* ---------- Halaman: Dashboard ---------- */
  async function viewDashboard() {
    const s = await api('/api/admin/stats');
    const recent = s.recent.length
      ? '<ul class="recent">' + s.recent.map((m) =>
          `<li><strong>${esc(m.name)}</strong>${m.is_read ? '' : '<span class="status badge">baru</span>'}` +
          `<small> · ${esc(fmtDate(m.created_at))}</small><p>${esc(m.message.length > 120 ? m.message.slice(0, 120) + '…' : m.message)}</p></li>`
        ).join('') + '</ul>'
      : '<p class="lead">Belum ada pesan dari pengunjung.</p>';

    $('#view').innerHTML =
      `<div class="stats">
         <a class="stat" href="#produk"><b>${s.products}</b><span>Total produk (${s.featured} unggulan)</span></a>
         <a class="stat" href="#galeri"><b>${s.gallery}</b><span>Foto galeri</span></a>
         <a class="stat" href="#testimoni"><b>${s.testimonials}</b><span>Testimoni</span></a>
         <a class="stat" href="#pesan"><b>${s.messages}</b><span>Total pesan masuk</span></a>
         <a class="stat${s.unread ? ' alert' : ''}" href="#pesan"><b>${s.unread}</b><span>Pesan belum dibaca</span></a>
       </div>
       <div class="panel"><h2>Pesan terbaru</h2>${recent}</div>`;
  }

  /* ---------- Halaman: pengaturan (hero / about / kontak) ---------- */
  async function viewSettings(key) {
    const cfg = SETTING_FORMS[key];
    const data = await api('/api/admin/settings/' + key);

    $('#view').innerHTML =
      `<div class="card">
         <p class="lead">${esc(cfg.desc)}</p>
         <form id="settingForm" novalidate>
           ${cfg.fields.map((f) => fieldHtml(f, data[f.name])).join('')}
           <div class="actions">
             <a class="btn btn-ghost" href="/" target="_blank" rel="noopener">Lihat website ↗</a>
             <button class="btn btn-primary" type="submit">Simpan Perubahan</button>
           </div>
         </form>
       </div>`;

    const form = $('#settingForm');
    bindImageFields(form);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('button[type="submit"]', form);
      btn.disabled = true;
      try {
        await api('/api/admin/settings/' + key, { method: 'PUT', body: readForm(form, cfg.fields) });
        toast('Perubahan berhasil disimpan ✓');
      } catch (err) {
        toast(err.message, true);
      }
      btn.disabled = false;
    });
  }

  /* ---------- Halaman: CRUD (produk / galeri / testimoni) ---------- */
  async function viewCrud(key) {
    const cfg = CRUD[key];
    const rows = await api('/api/admin/' + cfg.api);

    const table = rows.length
      ? `<div class="table-wrap"><table>
           <thead><tr>${cfg.columns.map((c) => `<th>${esc(c.label)}</th>`).join('')}<th></th></tr></thead>
           <tbody>${rows.map((r) =>
             `<tr>${cfg.columns.map((c) => `<td>${c.render(r)}</td>`).join('')}
                <td class="row-actions">
                  <button class="link" type="button" data-edit="${r.id}">Edit</button>
                  <button class="link danger" type="button" data-del="${r.id}">Hapus</button>
                </td></tr>`).join('')}
           </tbody></table></div>`
      : `<div class="empty">${esc(cfg.empty)}</div>`;

    $('#view').innerHTML =
      `<div class="toolbar"><p class="lead">${esc(cfg.desc)}</p>
         <button class="btn btn-primary" type="button" id="addBtn">+ Tambah</button></div>${table}`;

    $('#addBtn').addEventListener('click', () => openModal(key, null));

    // Satu listener untuk semua tombol Edit/Hapus di tabel (event delegation)
    $('#view').onclick = async (e) => {
      const editBtn = e.target.closest('[data-edit]');
      const delBtn = e.target.closest('[data-del]');
      if (editBtn) {
        const row = rows.find((r) => r.id === Number(editBtn.dataset.edit));
        if (row) openModal(key, row);
      } else if (delBtn) {
        if (!confirm('Yakin ingin menghapus data ini? Tindakan ini tidak bisa dibatalkan.')) return;
        try {
          await api(`/api/admin/${cfg.api}/${delBtn.dataset.del}`, { method: 'DELETE' });
          toast('Data dihapus.');
          viewCrud(key);
        } catch (err) {
          toast(err.message, true);
        }
      }
    };
  }

  function openModal(key, row) {
    const cfg = CRUD[key];
    const dlg = $('#modal');

    $('#modalBody').innerHTML =
      `<h2>${row ? 'Edit' : 'Tambah'} ${esc(cfg.title)}</h2>
       <form id="crudForm" novalidate>
         ${cfg.fields.map((f) => fieldHtml(f, row ? row[f.name] : f.default)).join('')}
         <div class="actions">
           <button class="btn btn-ghost" type="button" id="cancelBtn">Batal</button>
           <button class="btn btn-primary" type="submit">Simpan</button>
         </div>
       </form>`;

    const form = $('#crudForm');
    bindImageFields(form);
    $('#cancelBtn').addEventListener('click', () => dlg.close());

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('button[type="submit"]', form);
      btn.disabled = true;
      try {
        const body = readForm(form, cfg.fields);
        const url = '/api/admin/' + cfg.api + (row ? '/' + row.id : '');
        await api(url, { method: row ? 'PUT' : 'POST', body });
        dlg.close();
        toast(row ? 'Perubahan disimpan ✓' : 'Data berhasil ditambahkan ✓');
        viewCrud(key);
      } catch (err) {
        toast(err.message, true);
        btn.disabled = false;
      }
    });

    dlg.showModal();
  }

  /* ---------- Halaman: Pesan masuk ---------- */
  async function viewMessages() {
    const rows = await api('/api/admin/messages');
    if (!rows.length) {
      $('#view').innerHTML = '<div class="empty">Belum ada pesan dari form kontak.</div>';
      return;
    }

    $('#view').innerHTML = rows.map((m) =>
      `<article class="msg${m.is_read ? '' : ' unread'}">
         <div class="msg-head">
           <span><strong>${esc(m.name)}</strong>${m.is_read ? '' : '<span class="status">Belum dibaca</span>'}<br>
             <a href="mailto:${esc(m.email)}">${esc(m.email)}</a></span>
           <span>${esc(fmtDate(m.created_at))}</span>
         </div>
         <div class="msg-body">${esc(m.message)}</div>
         <button class="link" type="button" data-toggle="${m.id}" data-read="${m.is_read ? 0 : 1}">
           ${m.is_read ? 'Tandai belum dibaca' : 'Tandai sudah dibaca'}</button>
         <button class="link danger" type="button" data-del="${m.id}">Hapus</button>
       </article>`).join('');

    $('#view').onclick = async (e) => {
      const toggleBtn = e.target.closest('[data-toggle]');
      const delBtn = e.target.closest('[data-del]');
      try {
        if (toggleBtn) {
          await api('/api/admin/messages/' + toggleBtn.dataset.toggle, {
            method: 'PATCH', body: { is_read: toggleBtn.dataset.read === '1' }
          });
          await viewMessages();
          refreshBadge();
        } else if (delBtn) {
          if (!confirm('Hapus pesan ini?')) return;
          await api('/api/admin/messages/' + delBtn.dataset.del, { method: 'DELETE' });
          toast('Pesan dihapus.');
          await viewMessages();
          refreshBadge();
        }
      } catch (err) {
        toast(err.message, true);
      }
    };
  }

  /* ---------- Router berbasis #hash ---------- */
  const VIEWS = {
    dashboard: { title: 'Dashboard', run: viewDashboard },
    hero: { title: 'Hero Section', run: () => viewSettings('hero') },
    about: { title: 'Tentang Brand', run: () => viewSettings('about') },
    produk: { title: 'Produk', run: () => viewCrud('produk') },
    galeri: { title: 'Galeri', run: () => viewCrud('galeri') },
    testimoni: { title: 'Testimoni', run: () => viewCrud('testimoni') },
    kontak: { title: 'Info Kontak', run: () => viewSettings('contact') },
    pesan: { title: 'Pesan Masuk', run: viewMessages }
  };

  async function refreshBadge() {
    try {
      const s = await api('/api/admin/stats');
      const badge = $('#unreadBadge');
      badge.textContent = s.unread;
      badge.hidden = s.unread === 0;
    } catch { /* abaikan */ }
  }

  async function route() {
    const key = (window.location.hash || '#dashboard').slice(1);
    const view = VIEWS[key] || VIEWS.dashboard;
    const activeKey = VIEWS[key] ? key : 'dashboard';

    document.querySelectorAll('#sideNav a').forEach((a) => a.classList.toggle('active', a.dataset.view === activeKey));
    $('#pageTitle').textContent = view.title;
    $('#view').onclick = null;
    $('#view').innerHTML = '<div class="loading">Memuat…</div>';
    document.body.classList.remove('nav-open');

    try {
      await view.run();
    } catch (err) {
      $('#view').innerHTML = `<div class="empty">${esc(err.message)}</div>`;
    }
    refreshBadge();
  }

  /* ---------- Start ---------- */
  window.addEventListener('hashchange', route);

  $('#menuBtn').addEventListener('click', (e) => {
    e.stopPropagation(); // supaya klik ini tidak "naik" ke .main yang menutup menu
    document.body.classList.toggle('nav-open');
  });
  $('.main').addEventListener('click', () => document.body.classList.remove('nav-open'));

  $('#logoutBtn').addEventListener('click', async () => {
    try { await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' }); }
    finally { window.location.href = '/admin/login'; }
  });

  api('/api/admin/me').then((me) => { $('#adminName').textContent = '👤 ' + me.username; }).catch(() => {});
  route();
})();
