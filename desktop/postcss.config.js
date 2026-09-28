/**
 * Catatan: file ini memakai CommonJS (module.exports) dengan sengaja.
 * package.json tidak menyetel "type": "module" karena electron/main.js
 * memakai require(). Kalau file ini memakai `export default`, PostCSS akan
 * memperingatkan moduleless package.json.
 */
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
