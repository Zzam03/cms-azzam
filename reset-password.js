/* Reset password admin.
   Pemakaian:  node reset-password.js <username> <password-baru>
   Contoh:     node reset-password.js admin PasswordBaru123 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { db } = require('./db');

const [username, newPassword] = process.argv.slice(2);
if (!username || !newPassword) {
  console.log('Pemakaian: node reset-password.js <username> <password-baru>');
  process.exit(1);
}
if (newPassword.length < 8) {
  console.log('Password minimal 8 karakter.');
  process.exit(1);
}
const info = db
  .prepare('UPDATE admins SET password_hash = ? WHERE username = ?')
  .run(bcrypt.hashSync(newPassword, 12), username);
console.log(info.changes ? 'Password berhasil diganti.' : 'Username tidak ditemukan.');
