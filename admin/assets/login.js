/* login.js — mengirim username/password ke server, lalu pindah ke dashboard */
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const form = e.target;
  const errorBox = document.getElementById('loginError');
  const button = form.querySelector('button[type="submit"]');

  errorBox.textContent = '';
  button.disabled = true;
  button.textContent = 'Memproses…';

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: form.elements.username.value,
        password: form.elements.password.value
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Gagal masuk, coba lagi.');

    window.location.href = '/admin'; // cookie login sudah diset oleh server
  } catch (err) {
    errorBox.textContent = err.message;
    button.disabled = false;
    button.textContent = 'Masuk';
  }
});
