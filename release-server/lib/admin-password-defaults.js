const bcrypt = require('bcryptjs');

const DEFAULT_ADMIN_PASSWORD = 'rainy';
const MIN_PASSWORD_LENGTH = 5;

function defaultAdminPasswordHash() {
  return bcrypt.hashSync(DEFAULT_ADMIN_PASSWORD, 10);
}

module.exports = {
  DEFAULT_ADMIN_PASSWORD,
  MIN_PASSWORD_LENGTH,
  defaultAdminPasswordHash,
};
