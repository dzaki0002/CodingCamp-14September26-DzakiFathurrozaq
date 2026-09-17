/*
  app.js — Budget Tracker
  =======================
  File JavaScript utama. Bertanggung jawab atas:
    1. Menyimpan dan membaca data dari localStorage (tidak perlu server)
    2. Menambah dan menghapus item pengeluaran
    3. Menambah dan menghapus kategori kustom
    4. Me-render ulang semua elemen UI setiap kali data berubah
    5. Membuat dan memperbarui diagram donut (Chart.js)
    6. Filter periode (Semua / Minggu ini / Bulan ini)
    7. Pengurutan daftar transaksi (terbaru, terlama, harga naik/turun)
    8. Summary per rentang tanggal kustom (dari–sampai)

  Pola umum:
    - Data disimpan di array `expenses` (dalam memori) dan di localStorage
    - Setiap kali data berubah → saveToStorage() → renderAll()
    - renderAll() memanggil semua fungsi render secara berurutan
*/

'use strict'; // Aktifkan mode ketat — mencegah beberapa kesalahan JS umum


/* ============================================================
   BAGIAN 1 — KONSTANTA & KONFIGURASI
   ============================================================ */

/*
  Kunci yang digunakan untuk menyimpan data di localStorage.
  Mengubah string ini akan membuat data lama tidak terbaca.
*/
const STORAGE_KEY     = 'budget_tracker_items';       // Data pengeluaran
const STORAGE_CAT_KEY = 'budget_tracker_categories';  // Kategori kustom

/*
  Tiga kategori bawaan yang selalu ada.
  Setiap kategori memiliki:
    color — warna hex untuk dot dan chart
    emoji — ikon yang tampil di daftar
  Kategori ini tidak bisa dihapus.
*/
const BUILTIN_CATEGORIES = {
  Makanan:      { color: '#f97316', emoji: '🍔' },
  Transportasi: { color: '#3b82f6', emoji: '🚗' },
  Hiburan:      { color: '#a855f7', emoji: '🎮' },
};


/* ============================================================
   BAGIAN 2 — STATE (DATA AKTIF DI MEMORI)
   ============================================================ */

/*
  `expenses` — array berisi semua pengeluaran.
  Setiap item berbentuk objek:
  {
    id        : string unik (timestamp)
    name      : nama barang
    price     : harga dalam angka bulat
    category  : nama kategori
    createdAt : ISO string (contoh: "2026-09-17T10:30:00.000Z")
  }
*/
let expenses = loadFromStorage();

/*
  `customCategories` — objek berisi kategori yang dibuat pengguna.
  Format: { "NamaKategori": { color: "#hex", emoji: "🏷️" }, ... }
*/
let customCategories = loadCustomCategories();

/*
  `currentSort` — menentukan urutan tampilan daftar transaksi.
  Nilai yang valid: 'newest' | 'oldest' | 'price-asc' | 'price-desc'
*/
let currentSort = 'newest';

/*
  `currentPeriod` — filter waktu untuk balance, daftar, dan chart.
  Nilai yang valid: 'all' | 'week' | 'month'
*/
let currentPeriod = 'all';

/*
  `chart` — instance Chart.js yang aktif.
  Disimpan agar bisa di-update tanpa membuat ulang chart dari nol.
  Awalnya null, diisi pertama kali renderChart() dipanggil.
*/
let chart = null;


/* ============================================================
   BAGIAN 3 — FUNGSI HELPER KATEGORI
   ============================================================ */

/*
  allCategories()
  Menggabungkan kategori bawaan dan kategori kustom menjadi satu objek.
  Dipakai saat render agar kode tidak perlu mengecek keduanya terpisah.
  Jika nama kategori custom sama dengan bawaan, custom akan menimpa bawaan.
*/
function allCategories() {
  return Object.assign({}, BUILTIN_CATEGORIES, customCategories);
}


/* ============================================================
   BAGIAN 4 — FUNGSI PENYIMPANAN (localStorage)
   ============================================================ */

/*
  loadFromStorage()
  Membaca array pengeluaran dari localStorage.
  Mengembalikan array kosong [] jika belum ada data atau data rusak.
*/
function loadFromStorage() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return []; // Jika JSON tidak valid (misalnya data korup), abaikan
  }
}

/*
  saveToStorage()
  Menyimpan array `expenses` ke localStorage sebagai JSON.
  Dipanggil setiap kali data berubah (tambah/hapus).
*/
function saveToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
}

/*
  loadCustomCategories()
  Membaca objek kategori kustom dari localStorage.
  Mengembalikan {} jika belum ada atau data rusak.
*/
function loadCustomCategories() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_CAT_KEY)) || {};
  } catch {
    return {};
  }
}

/*
  saveCustomCategories()
  Menyimpan objek `customCategories` ke localStorage.
  Dipanggil setiap kali kategori kustom ditambah atau dihapus.
*/
function saveCustomCategories() {
  localStorage.setItem(STORAGE_CAT_KEY, JSON.stringify(customCategories));
}


/* ============================================================
   BAGIAN 5 — FUNGSI FORMAT & UTILITAS
   ============================================================ */

/*
  formatRupiah(amount)
  Mengubah angka menjadi format rupiah Indonesia.
  Contoh: 25000 → "Rp 25.000"
  Math.round() memastikan tidak ada desimal.
*/
function formatRupiah(amount) {
  return 'Rp ' + Math.round(amount).toLocaleString('id-ID');
}

/*
  escapeHtml(str)
  Mengamankan string dari serangan XSS (Cross-Site Scripting).
  Karakter berbahaya seperti < > & " diubah menjadi entitas HTML.
  WAJIB dipakai setiap kali menampilkan data dari pengguna ke innerHTML.
*/
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}


/* ============================================================
   BAGIAN 6 — FUNGSI FILTER TANGGAL
   ============================================================ */

/*
  startOfWeek()
  Mengembalikan objek Date yang menunjuk ke awal minggu berjalan
  (hari Minggu pukul 00:00:00).
  Digunakan untuk filter "Minggu Ini".
*/
function startOfWeek() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // d.getDay() = 0 (Minggu) s.d. 6 (Sabtu)
  return d;
}

/*
  startOfMonth()
  Mengembalikan objek Date yang menunjuk ke tanggal 1 bulan berjalan pukul 00:00.
  Digunakan untuk filter "Bulan Ini".
*/
function startOfMonth() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d;
}

/*
  filterByPeriod(list, period)
  Menyaring array transaksi berdasarkan periode yang dipilih.
  - 'all'   → kembalikan semua tanpa filter
  - 'week'  → hanya transaksi sejak awal minggu ini
  - 'month' → hanya transaksi sejak tanggal 1 bulan ini
*/
function filterByPeriod(list, period) {
  if (period === 'all') return list;

  const cutoff = period === 'week' ? startOfWeek() : startOfMonth();
  return list.filter(item => new Date(item.createdAt) >= cutoff);
}


/* ============================================================
   BAGIAN 7 — FUNGSI PENGURUTAN
   ============================================================ */

/*
  sortExpenses(list)
  Mengembalikan salinan array yang sudah diurutkan sesuai `currentSort`.
  Salinan (spread [...list]) digunakan agar array asli tidak berubah.
  Nilai `currentSort`:
    'newest'     → dari createdAt terbaru ke terlama
    'oldest'     → dari createdAt terlama ke terbaru
    'price-asc'  → dari harga terendah ke tertinggi
    'price-desc' → dari harga tertinggi ke terendah
*/
function sortExpenses(list) {
  const copy = [...list];
  switch (currentSort) {
    case 'newest':     return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    case 'oldest':     return copy.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    case 'price-asc':  return copy.sort((a, b) => a.price - b.price);
    case 'price-desc': return copy.sort((a, b) => b.price - a.price);
    default:           return copy;
  }
}


/* ============================================================
   BAGIAN 8 — REFERENSI ELEMEN DOM
   Semua querySelector/getElementById dikumpulkan di sini
   agar mudah dicari dan tidak tersebar di seluruh file.
   ============================================================ */

// Form tambah pengeluaran dan input-inputnya
const form          = document.getElementById('expense-form');
const inputName     = document.getElementById('item-name');
const inputPrice    = document.getElementById('item-price');
const inputCategory = document.getElementById('item-category');

// Elemen di balance card
const totalBalanceEl = document.getElementById('total-balance');

// Elemen di daftar transaksi
const transactionList = document.getElementById('transaction-list');
const emptyState      = document.getElementById('empty-state');  // Pesan "belum ada data"
const itemCountEl     = document.getElementById('item-count');   // Badge "N item"

// Elemen chart (canvas + teks kosong + area legend)
const chartCanvas  = document.getElementById('expense-chart');
const chartEmptyEl = document.getElementById('chart-empty');
const chartLegendEl = document.getElementById('chart-legend');

// Elemen kartu ringkasan cepat (minggu, bulan, rata-rata)
const summaryWeekEl     = document.getElementById('summary-week');
const summaryWeekCount  = document.getElementById('summary-week-count');
const summaryMonthEl    = document.getElementById('summary-month');
const summaryMonthCount = document.getElementById('summary-month-count');
const summaryAvgEl      = document.getElementById('summary-avg');
const summaryAvgSub     = document.getElementById('summary-avg-sub');

// Elemen form kategori kustom
const newCatName    = document.getElementById('new-cat-name');
const newCatEmoji   = document.getElementById('new-cat-emoji');
const newCatColor   = document.getElementById('new-cat-color');
const btnAddCat     = document.getElementById('btn-add-category');
const customCatList = document.getElementById('custom-cat-list');


/* ============================================================
   BAGIAN 9 — FUNGSI RENDER (mengubah DOM sesuai data)
   ============================================================ */

/*
  renderCategoryOptions()
  Mengisi dropdown #item-category dengan opsi kategori kustom.
  Opsi bawaan (4 buah: disabled + 3 kategori) tidak disentuh.
  Dipanggil: saat halaman pertama load, dan setiap kali kategori berubah.
*/
function renderCategoryOptions() {
  const currentVal = inputCategory.value; // Simpan pilihan sebelumnya

  // Hapus semua opsi kustom yang mungkin sudah ada (> 4 opsi bawaan)
  const builtinCount = 4; // 1 disabled + 3 opsi built-in
  while (inputCategory.options.length > builtinCount) {
    inputCategory.remove(builtinCount);
  }

  // Tambahkan setiap kategori kustom sebagai <option> baru
  Object.entries(customCategories).forEach(([name, cfg]) => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = `${cfg.emoji || '🏷️'} ${name}`;
    inputCategory.appendChild(opt);
  });

  // Kembalikan pilihan pengguna jika masih tersedia di dropdown
  if (currentVal) inputCategory.value = currentVal;
}

/*
  renderCustomCatChips()
  Menampilkan chip (badge berwarna) untuk setiap kategori kustom
  di area #custom-cat-list. Setiap chip memiliki tombol × untuk hapus.
  Dipanggil: saat load dan setiap kali kategori kustom berubah.
*/
function renderCustomCatChips() {
  customCatList.innerHTML = ''; // Bersihkan dulu

  Object.entries(customCategories).forEach(([name, cfg]) => {
    const chip = document.createElement('span');
    chip.className = 'cat-chip';
    chip.style.background = cfg.color || '#888'; // Warna latar chip sesuai warna kategori

    chip.innerHTML = `
      <span class="cat-chip-dot"></span>
      ${cfg.emoji ? escapeHtml(cfg.emoji) + ' ' : ''}${escapeHtml(name)}
      <button class="cat-chip-del" data-cat="${escapeHtml(name)}" title="Hapus kategori">×</button>
    `;
    customCatList.appendChild(chip);
  });
}

/*
  renderBalance()
  Memperbarui angka total di balance card.
  Total dihitung dari pengeluaran yang sudah difilter sesuai currentPeriod.
*/
function renderBalance() {
  const filtered = filterByPeriod(expenses, currentPeriod);
  const total    = filtered.reduce((sum, item) => sum + item.price, 0);
  totalBalanceEl.textContent = formatRupiah(total);
}

/*
  renderSummary()
  Mengisi 3 kartu ringkasan cepat:
    1. Total minggu ini + jumlah transaksi
    2. Total bulan ini + jumlah transaksi
    3. Rata-rata per hari bulan ini (total bulan ÷ hari ke-N)
  Selalu dihitung dari ALL data, bukan currentPeriod,
  karena kartu ini dimaksudkan sebagai ringkasan tetap.
*/
function renderSummary() {
  const weekItems  = filterByPeriod(expenses, 'week');
  const monthItems = filterByPeriod(expenses, 'month');

  const weekTotal  = weekItems.reduce((s, i) => s + i.price, 0);
  const monthTotal = monthItems.reduce((s, i) => s + i.price, 0);

  // Rata-rata harian: total bulan ini dibagi hari ke berapa sekarang
  const today    = new Date();
  const daysPast = today.getDate(); // Misal: tanggal 17 → daysPast = 17
  const avgDay   = daysPast > 0 ? monthTotal / daysPast : 0;

  summaryWeekEl.textContent     = formatRupiah(weekTotal);
  summaryWeekCount.textContent  = weekItems.length + ' transaksi';
  summaryMonthEl.textContent    = formatRupiah(monthTotal);
  summaryMonthCount.textContent = monthItems.length + ' transaksi';
  summaryAvgEl.textContent      = formatRupiah(avgDay);
  summaryAvgSub.textContent     = 'hari ke-' + daysPast + ' bulan ini';
}

/*
  renderItemCount()
  Memperbarui badge "N item" di header daftar transaksi.
  Dihitung dari data yang sudah difilter sesuai currentPeriod.
*/
function renderItemCount() {
  const filtered = filterByPeriod(expenses, currentPeriod);
  itemCountEl.textContent = filtered.length + ' item';
}

/*
  renderTransactions()
  Menghapus semua elemen lama di #transaction-list
  lalu membangun ulang daftar dari data terbaru.
  Data difilter (filterByPeriod) lalu diurutkan (sortExpenses) sebelum di-render.
  Setiap item berisi: dot warna, nama, kategori, harga, tombol hapus.
*/
function renderTransactions() {
  // Hapus semua elemen anak kecuali #empty-state (agar node-nya tidak hilang dari DOM)
  Array.from(transactionList.children).forEach(child => {
    if (child !== emptyState) child.remove();
  });

  const filtered = sortExpenses(filterByPeriod(expenses, currentPeriod));

  // Tampilkan pesan kosong jika tidak ada data di periode ini
  if (filtered.length === 0) {
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  const cats = allCategories(); // Gabungan built-in + custom

  filtered.forEach(item => {
    const cfg = cats[item.category] || {}; // Ambil config warna/emoji kategori ini

    const el = document.createElement('div');
    el.className  = 'transaction-item';
    el.dataset.id = item.id; // Simpan id di data attribute untuk event delete

    /*
      Dot warna kategori:
      - Kategori bawaan → pakai CSS class (misal: dot-makanan)
      - Kategori kustom → pakai inline style karena warnanya dinamis
    */
    const dotStyle = BUILTIN_CATEGORIES[item.category]
      ? `class="category-dot dot-${item.category.toLowerCase()}"`
      : `class="category-dot" style="background:${cfg.color || '#ccc'}"`;

    el.innerHTML = `
      <span ${dotStyle}></span>
      <div class="item-info">
        <div class="item-name">${escapeHtml(item.name)}</div>
        <div class="item-meta">${cfg.emoji ? cfg.emoji + ' ' : ''}${escapeHtml(item.category)}</div>
      </div>
      <span class="item-price">${formatRupiah(item.price)}</span>
      <button class="btn-delete" aria-label="Hapus ${escapeHtml(item.name)}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
          <path d="M10 11v6"/><path d="M14 11v6"/>
          <path d="M9 6V4h6v2"/>
        </svg>
      </button>
    `;
    transactionList.appendChild(el);
  });
}

/*
  renderChart()
  Membuat atau memperbarui diagram donut Chart.js.
  Data diambil dari pengeluaran yang sudah difilter sesuai currentPeriod.
  Setiap kategori menjadi satu irisan dengan warna dari config-nya.

  Strategi update:
  - Jika chart sudah ada → update data saja (lebih cepat, ada animasi)
  - Jika belum ada → buat instance baru
*/
function renderChart() {
  const filtered = filterByPeriod(expenses, currentPeriod);
  const cats     = allCategories();

  // Hitung total per kategori dari pengeluaran yang difilter
  const totals = {};
  filtered.forEach(item => {
    totals[item.category] = (totals[item.category] || 0) + item.price;
  });

  const categories = Object.keys(totals);
  const hasData    = categories.length > 0;

  // Tampilkan/sembunyikan canvas dan pesan kosong
  chartEmptyEl.style.display = hasData ? 'none' : 'block';
  chartCanvas.style.display  = hasData ? 'block' : 'none';

  const labels = categories;
  const data   = categories.map(c => totals[c]);
  const colors = categories.map(c => cats[c]?.color || '#ccc');

  if (chart) {
    // Update chart yang sudah ada (tidak perlu re-render dari nol)
    chart.data.labels                      = labels;
    chart.data.datasets[0].data            = data;
    chart.data.datasets[0].backgroundColor = colors;
    chart.update('active'); // 'active' = animasi halus
  } else {
    // Buat chart baru pertama kali
    chart = new Chart(chartCanvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors,
          borderWidth: 2,        // Garis putih tipis antar irisan
          borderColor: '#ffffff',
          hoverOffset: 6,        // Irisan sedikit memisah saat di-hover
        }],
      },
      options: {
        responsive: true,
        cutout: '62%',           // Lubang di tengah (doughnut vs pie penuh)
        plugins: {
          legend: { display: false }, // Matikan legend bawaan, kita buat sendiri
          tooltip: {
            callbacks: {
              // Format tooltip: tampilkan nominal rupiah, bukan angka mentah
              label(ctx) { return '  ' + formatRupiah(ctx.parsed); },
            },
          },
        },
        animation: { duration: 350 }, // Animasi 350ms saat update
      },
    });
  }

  // Render legend kustom di bawah chart
  renderLegend(categories, totals, cats);
}

/*
  renderLegend(categories, totals, cats)
  Membangun legend kustom di bawah diagram.
  Setiap baris: [dot warna] [emoji + nama kategori] ... [persentase · nominal]

  Parameter:
    categories — array nama kategori yang ada di data
    totals     — objek { namaKategori: totalNominal }
    cats       — objek config gabungan semua kategori
*/
function renderLegend(categories, totals, cats) {
  const grandTotal = Object.values(totals).reduce((s, v) => s + v, 0);
  chartLegendEl.innerHTML = ''; // Bersihkan legend lama

  categories.forEach(cat => {
    const cfg    = cats[cat] || {};
    const amount = totals[cat];
    // Hitung persentase dan bulatkan ke angka integer
    const pct    = grandTotal > 0 ? Math.round((amount / grandTotal) * 100) : 0;

    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `
      <div class="legend-left">
        <span class="legend-dot" style="background:${cfg.color || '#ccc'}"></span>
        <span class="legend-label">${cfg.emoji ? cfg.emoji + ' ' : ''}${escapeHtml(cat)}</span>
      </div>
      <span class="legend-value">${pct}% · ${formatRupiah(amount)}</span>
    `;
    chartLegendEl.appendChild(item);
  });
}

/*
  renderAll()
  Fungsi utama yang memanggil semua render sekaligus.
  Dipanggil setiap kali data berubah (tambah/hapus item atau kategori,
  atau saat filter periode/sort berubah).
*/
function renderAll() {
  renderBalance();
  renderSummary();
  renderItemCount();
  renderTransactions();
  renderChart();
}


/* ============================================================
   BAGIAN 10 — FUNGSI MUTASI DATA
   ============================================================ */

/*
  addExpense(name, price, category)
  Membuat objek item baru dan menambahkannya ke array `expenses`.
  id menggunakan timestamp (Date.now()) agar unik.
  createdAt disimpan sebagai ISO string untuk kemudahan sorting dan filtering.
*/
function addExpense(name, price, category) {
  expenses.push({
    id: Date.now().toString(), // Unik karena milisekon berbeda setiap kali
    name,
    price,
    category,
    createdAt: new Date().toISOString(), // Contoh: "2026-09-17T08:30:00.000Z"
  });
  saveToStorage(); // Simpan ke localStorage
  renderAll();     // Perbarui semua tampilan
}

/*
  deleteExpense(id)
  Menghapus item dari array `expenses` berdasarkan id.
  filter() mengembalikan array baru tanpa item yang cocok.
*/
function deleteExpense(id) {
  expenses = expenses.filter(item => item.id !== id);
  saveToStorage();
  renderAll();
}

/*
  addCustomCategory(name, emoji, color)
  Menambahkan kategori baru ke objek `customCategories`.
  Setelah disimpan, dropdown dan chip diperbarui.
*/
function addCustomCategory(name, emoji, color) {
  customCategories[name] = { color, emoji };
  saveCustomCategories();
  renderCategoryOptions(); // Tambahkan ke dropdown
  renderCustomCatChips();  // Tampilkan chip baru
}

/*
  deleteCustomCategory(name)
  Menghapus kategori kustom dari objek `customCategories`.
  Catatan: transaksi yang sudah menggunakan kategori ini tidak ikut dihapus
  — mereka hanya kehilangan warna/emoji karena config-nya sudah tidak ada.
*/
function deleteCustomCategory(name) {
  delete customCategories[name];
  saveCustomCategories();
  renderCategoryOptions(); // Hapus dari dropdown
  renderCustomCatChips();  // Hapus chip
  renderAll();             // Perbarui chart dan daftar
}


/* ============================================================
   BAGIAN 11 — EVENT LISTENERS (respons terhadap aksi pengguna)
   ============================================================ */

/*
  Event: submit form tambah pengeluaran
  Validasi input → buat item baru → reset form → fokus ke field nama.
*/
form.addEventListener('submit', e => {
  e.preventDefault(); // Cegah refresh halaman (default perilaku form HTML)

  const name     = inputName.value.trim();
  const price    = parseInt(inputPrice.value, 10); // parseInt basis 10
  const category = inputCategory.value;

  // Validasi sederhana sebelum menyimpan
  if (!name || !price || price < 1 || !category) return;

  addExpense(name, price, category);

  form.reset();        // Kosongkan semua input
  inputName.focus();   // Kembalikan fokus ke field pertama
});

/*
  Event: klik tombol hapus di daftar transaksi (event delegation)
  Kenapa delegation? Karena item-item transaksi dibuat secara dinamis oleh JS,
  sehingga tidak bisa langsung pasang listener ke masing-masing tombol.
  Sebagai gantinya, satu listener dipasang di container (#transaction-list),
  lalu dicek apakah yang diklik adalah .btn-delete atau bukan.
*/
transactionList.addEventListener('click', e => {
  const btn = e.target.closest('.btn-delete'); // closest() naik ke ancestor terdekat
  if (!btn) return; // Klik bukan di tombol hapus, abaikan

  const itemEl = btn.closest('.transaction-item');
  if (!itemEl) return;

  deleteExpense(itemEl.dataset.id); // Ambil id dari data attribute
});

/*
  Event: klik tombol "Tambah" kategori kustom
  Validasi nama → cek duplikat → simpan → reset input.
*/
btnAddCat.addEventListener('click', () => {
  const name  = newCatName.value.trim();
  const emoji = newCatEmoji.value.trim();
  const color = newCatColor.value;

  // Nama wajib diisi
  if (!name) { newCatName.focus(); return; }

  // Cegah duplikat dengan kategori bawaan atau kustom yang sudah ada
  if (BUILTIN_CATEGORIES[name] || customCategories[name]) {
    // Flash merah pada input sebagai umpan balik visual
    newCatName.style.borderColor = 'var(--danger)';
    setTimeout(() => newCatName.style.borderColor = '', 1200);
    return;
  }

  addCustomCategory(name, emoji, color);
  newCatName.value  = '';  // Reset input nama
  newCatEmoji.value = '';  // Reset input emoji
  newCatName.focus();
});

/*
  Event: klik tombol × di chip kategori kustom (event delegation)
  Sama seperti delete transaksi, pakai delegation karena chip dibuat dinamis.
*/
customCatList.addEventListener('click', e => {
  const btn = e.target.closest('.cat-chip-del');
  if (!btn) return;
  deleteCustomCategory(btn.dataset.cat); // Nama kategori ada di data-cat attribute
});

/*
  Event: klik tombol filter periode (Semua / Minggu / Bulan)
  Update currentPeriod → tandai tombol aktif → render ulang semua.
*/
document.querySelectorAll('.period-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentPeriod = btn.dataset.period;

    // Pindahkan class 'active' ke tombol yang baru diklik
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    renderAll(); // Balance, daftar, dan chart ikut berubah
  });
});

/*
  Event: klik tombol urutan (Terbaru / Terlama / Harga ↑ / Harga ↓)
  Update currentSort → tandai tombol aktif → render ulang HANYA daftar transaksi
  (balance dan chart tidak perlu ikut berubah).
*/
document.querySelectorAll('.sort-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentSort = btn.dataset.sort;

    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    renderTransactions(); // Cukup render daftar saja
  });
});


/* ============================================================
   BAGIAN 12 — FITUR SUMMARY PER RENTANG TANGGAL
   ============================================================ */

/* --- Referensi DOM khusus date range --- */

const btnToggleDateRange = document.getElementById('btn-toggle-daterange'); // Tombol buka/tutup picker
const dateRangePicker    = document.getElementById('date-range-picker');     // Area picker (tersembunyi)
const dateRangeResult    = document.getElementById('date-range-result');     // Panel hasil (tersembunyi)
const dateFromInput      = document.getElementById('date-from');             // Input tanggal mulai
const dateToInput        = document.getElementById('date-to');               // Input tanggal selesai
const btnApplyRange      = document.getElementById('btn-apply-range');       // Tombol "Terapkan"
const btnClearRange      = document.getElementById('btn-clear-range');       // Tombol "Hapus filter"
const rangeActiveLabel   = document.getElementById('range-active-label');    // Label periode yang aktif
const rangeTotalEl       = document.getElementById('range-total');           // Statistik: total nominal
const rangeCountEl       = document.getElementById('range-count');           // Statistik: jumlah transaksi
const rangeAvgEl         = document.getElementById('range-avg');             // Statistik: rata-rata/hari
const rangeMaxEl         = document.getElementById('range-max');             // Statistik: pengeluaran terbesar
const rangeBreakdownEl   = document.getElementById('range-breakdown');       // Area breakdown per kategori
const rangeDailyListEl   = document.getElementById('range-daily-list');      // Area rincian per hari

/*
  toLocalDateStr(date)
  Mengubah objek Date menjadi string "YYYY-MM-DD" menggunakan waktu lokal browser.
  PENTING: Tidak bisa pakai date.toISOString().slice(0,10) karena itu berbasis UTC
  dan bisa berbeda 1 hari dengan waktu lokal (misal WIB UTC+7).
*/
function toLocalDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0'); // Bulan 0-indexed, tambah 1
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`; // Contoh: "2026-09-17"
}

/*
  formatDisplayDate(dateStr)
  Mengubah string "YYYY-MM-DD" menjadi format tampilan yang lebih ramah.
  Contoh: "2026-09-17" → "17 Sep 2026"
*/
function formatDisplayDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]} ${y}`;
}

/*
  applyQuickPreset(type)
  Mengisi input dateFromInput dan dateToInput secara otomatis
  berdasarkan preset yang dipilih:
    'today'     → hari ini s.d. hari ini
    'yesterday' → kemarin s.d. kemarin
    'last7'     → 6 hari lalu s.d. hari ini (total 7 hari)
    'last30'    → 29 hari lalu s.d. hari ini (total 30 hari)
    'thismonth' → tanggal 1 bulan ini s.d. hari ini
    'lastmonth' → tanggal 1 s.d. akhir bulan lalu
*/
function applyQuickPreset(type) {
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Normalisasi ke awal hari

  let from, to; // Akan diisi string "YYYY-MM-DD"

  switch (type) {
    case 'today': {
      from = to = toLocalDateStr(today);
      break;
    }
    case 'yesterday': {
      const yest = new Date(today);
      yest.setDate(yest.getDate() - 1);
      from = to = toLocalDateStr(yest);
      break;
    }
    case 'last7': {
      // Dari 6 hari lalu (inklusif) hingga hari ini = 7 hari total
      const d7 = new Date(today);
      d7.setDate(d7.getDate() - 6);
      from = toLocalDateStr(d7);
      to   = toLocalDateStr(today);
      break;
    }
    case 'last30': {
      const d30 = new Date(today);
      d30.setDate(d30.getDate() - 29);
      from = toLocalDateStr(d30);
      to   = toLocalDateStr(today);
      break;
    }
    case 'thismonth': {
      // Dari tanggal 1 bulan ini hingga hari ini
      const fm = new Date(today.getFullYear(), today.getMonth(), 1);
      from = toLocalDateStr(fm);
      to   = toLocalDateStr(today);
      break;
    }
    case 'lastmonth': {
      // Bulan lalu: dari tanggal 1 hingga hari terakhir
      const lmStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lmEnd   = new Date(today.getFullYear(), today.getMonth(), 0); // Hari ke-0 bulan ini = hari terakhir bulan lalu
      from = toLocalDateStr(lmStart);
      to   = toLocalDateStr(lmEnd);
      break;
    }
    default: return;
  }

  // Isi input tanggal
  dateFromInput.value = from;
  dateToInput.value   = to;

  // Highlight tombol preset yang aktif
  document.querySelectorAll('.quick-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.quick === type);
  });
}

/*
  renderDateRangeSummary(fromStr, toStr)
  Fungsi utama untuk menghitung dan menampilkan ringkasan rentang tanggal.
  fromStr dan toStr adalah string "YYYY-MM-DD".
  Rentang bersifat inklusif di kedua ujung (dari jam 00:00 hingga 23:59).

  Mengembalikan:
    true  → berhasil, panel hasil ditampilkan
    false → gagal (input tidak valid atau tanggal terbalik)

  Yang dihitung dan ditampilkan:
    - Total pengeluaran
    - Jumlah transaksi
    - Rata-rata per hari (total ÷ jumlah hari dalam rentang)
    - Pengeluaran terbesar (satu item dengan harga tertinggi)
    - Breakdown per kategori dengan progress bar
    - Rincian harian (setiap hari yang ada transaksinya)
*/
function renderDateRangeSummary(fromStr, toStr) {
  // Parse tanggal: "from" mulai dari jam 00:00, "to" sampai jam 23:59:59
  const fromDate = new Date(fromStr + 'T00:00:00');
  const toDate   = new Date(toStr   + 'T23:59:59');

  // Validasi: tanggal harus valid dan "from" tidak boleh setelah "to"
  if (isNaN(fromDate) || isNaN(toDate) || fromDate > toDate) return false;

  // Filter transaksi yang jatuh dalam rentang ini
  const filtered = expenses.filter(item => {
    const d = new Date(item.createdAt);
    return d >= fromDate && d <= toDate;
  });

  const cats = allCategories();

  // ── Hitung statistik dasar ─────────────────────────────────────────
  const total   = filtered.reduce((s, i) => s + i.price, 0);
  const count   = filtered.length;

  // Item dengan harga tertinggi (reduce membandingkan satu per satu)
  const maxItem = filtered.reduce((m, i) => i.price > (m?.price || 0) ? i : m, null);

  // Jumlah hari dalam rentang (inklusif)
  const msPerDay = 86400000; // 1 hari = 86.400.000 milisekon
  const dayCount = Math.round((toDate - fromDate) / msPerDay) + 1;
  const avgDay   = dayCount > 0 ? total / dayCount : 0;

  // Tampilkan ke elemen DOM
  rangeTotalEl.textContent = formatRupiah(total);
  rangeCountEl.textContent = count + ' transaksi';
  rangeAvgEl.textContent   = formatRupiah(avgDay);
  rangeMaxEl.textContent   = maxItem ? formatRupiah(maxItem.price) : 'Rp 0';

  // ── Breakdown per kategori ─────────────────────────────────────────
  // Hitung total per kategori dari data yang difilter
  const catTotals = {};
  filtered.forEach(item => {
    catTotals[item.category] = (catTotals[item.category] || 0) + item.price;
  });

  // Urutkan dari kategori dengan pengeluaran terbesar
  const sortedCats = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);

  rangeBreakdownEl.innerHTML = ''; // Bersihkan konten lama
  sortedCats.forEach(([cat, amount]) => {
    const cfg = cats[cat] || {};
    const pct = total > 0 ? Math.round((amount / total) * 100) : 0;

    const row = document.createElement('div');
    row.className = 'breakdown-row';
    row.innerHTML = `
      <span class="breakdown-dot" style="background:${cfg.color || '#ccc'}"></span>
      <span class="breakdown-name">${cfg.emoji ? cfg.emoji + ' ' : ''}${escapeHtml(cat)}</span>
      <div class="breakdown-bar-wrap">
        <!-- Lebar progress bar diset langsung via style, proporsional ke persen -->
        <div class="breakdown-bar" style="width:${pct}%;background:${cfg.color || '#ccc'}"></div>
      </div>
      <span class="breakdown-pct">${pct}%</span>
      <span class="breakdown-val">${formatRupiah(amount)}</span>
    `;
    rangeBreakdownEl.appendChild(row);
  });

  // ── Rincian per hari ──────────────────────────────────────────────
  // Kelompokkan transaksi berdasarkan tanggal (string "YYYY-MM-DD")
  const dailyMap = {};
  filtered.forEach(item => {
    const dayKey = toLocalDateStr(new Date(item.createdAt));
    if (!dailyMap[dayKey]) dailyMap[dayKey] = { total: 0, count: 0 };
    dailyMap[dayKey].total += item.price;
    dailyMap[dayKey].count++;
  });

  // Urutkan dari hari terbaru ke terlama
  const sortedDays = Object.entries(dailyMap).sort((a, b) => b[0].localeCompare(a[0]));

  rangeDailyListEl.innerHTML = ''; // Bersihkan konten lama

  if (sortedDays.length === 0) {
    // Tidak ada transaksi sama sekali di rentang ini
    rangeDailyListEl.innerHTML = '<p class="empty-state" style="padding:12px 0">Tidak ada transaksi di rentang ini</p>';
  } else {
    sortedDays.forEach(([day, data]) => {
      const row = document.createElement('div');
      row.className = 'daily-row';
      row.innerHTML = `
        <span class="daily-date">${formatDisplayDate(day)}</span>
        <span class="daily-count">${data.count} transaksi</span>
        <span class="daily-total">${formatRupiah(data.total)}</span>
      `;
      rangeDailyListEl.appendChild(row);
    });
  }

  // ── Label periode aktif ────────────────────────────────────────────
  // Tampilkan "17 Sep 2026" (1 hari) atau "1 Sep 2026 – 17 Sep 2026" (rentang)
  rangeActiveLabel.textContent =
    fromStr === toStr
      ? formatDisplayDate(fromStr)
      : `${formatDisplayDate(fromStr)} – ${formatDisplayDate(toStr)}`;

  return true; // Berhasil
}

/*
  Event: klik tombol toggle "Pilih Rentang ▾ / Tutup ▴"
  Menampilkan atau menyembunyikan area picker tanggal.
  aria-expanded diperbarui untuk aksesibilitas screen reader.
*/
btnToggleDateRange.addEventListener('click', () => {
  const isOpen = !dateRangePicker.hidden; // Saat ini: apakah sedang terbuka?

  dateRangePicker.hidden = isOpen; // Balik status: jika buka → tutup, sebaliknya
  btnToggleDateRange.setAttribute('aria-expanded', String(!isOpen));
  btnToggleDateRange.textContent = isOpen ? 'Pilih Rentang ▾' : 'Tutup ▴';
});

/*
  Event: klik salah satu tombol preset cepat
  Memanggil applyQuickPreset() dengan nilai dari data-quick attribute.
*/
document.querySelectorAll('.quick-btn').forEach(btn => {
  btn.addEventListener('click', () => applyQuickPreset(btn.dataset.quick));
});

/*
  Event: klik tombol "Terapkan"
  Validasi input → hitung summary → tampilkan hasil → sembunyikan picker.
*/
btnApplyRange.addEventListener('click', () => {
  const from = dateFromInput.value;
  const to   = dateToInput.value;

  // Jika salah satu input kosong, flash merah sebagai peringatan
  if (!from || !to) {
    if (!from) {
      dateFromInput.style.borderColor = 'var(--danger)';
      setTimeout(() => dateFromInput.style.borderColor = '', 1200);
    }
    if (!to) {
      dateToInput.style.borderColor = 'var(--danger)';
      setTimeout(() => dateToInput.style.borderColor = '', 1200);
    }
    return;
  }

  // Hitung dan render summary — jika gagal (misalnya from > to), flash merah
  const ok = renderDateRangeSummary(from, to);
  if (!ok) {
    dateFromInput.style.borderColor = 'var(--danger)';
    dateToInput.style.borderColor   = 'var(--danger)';
    setTimeout(() => {
      dateFromInput.style.borderColor = '';
      dateToInput.style.borderColor   = '';
    }, 1200);
    return;
  }

  // Tampilkan panel hasil, sembunyikan picker
  dateRangeResult.hidden = false;
  dateRangePicker.hidden = true;
  btnToggleDateRange.textContent = 'Pilih Rentang ▾';
  btnToggleDateRange.setAttribute('aria-expanded', 'false');
});

/*
  Event: klik "× Hapus filter"
  Sembunyikan panel hasil, kosongkan input, hapus highlight preset aktif.
*/
btnClearRange.addEventListener('click', () => {
  dateRangeResult.hidden = true;
  dateFromInput.value    = '';
  dateToInput.value      = '';
  document.querySelectorAll('.quick-btn').forEach(b => b.classList.remove('active'));
});


/* ============================================================
   BAGIAN 13 — INISIALISASI
   Kode yang dijalankan satu kali saat halaman pertama dibuka.
   ============================================================ */

/*
  1. Isi dropdown kategori dengan kategori kustom dari localStorage
  2. Tampilkan chip kategori kustom
  3. Render semua komponen UI dengan data dari localStorage
*/
renderCategoryOptions();
renderCustomCatChips();
renderAll();
