const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

module.exports = {
  port: Number(process.env.PORT) || 3000,
  rootDir: path.resolve(__dirname, '../..'),
  frontendDir: path.resolve(__dirname, '../../frontend')
};
