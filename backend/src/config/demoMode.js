/*
 * Mode demo.
 *
 * Sejak state dipindahkan ke database (lihat stateStore.js), modul ini menjadi
 * delegasi tipis demi kompatibilitas pemanggil lama.
 *
 * CATATAN PERUBAHAN PERILAKU:
 *   setDemoActive() dahulu SINKRON, kini ASYNC karena harus menulis ke database.
 *   Pemanggil wajib memakai `await`. isDemoActive() tetap sinkron.
 *
 * Untuk kode baru, impor langsung dari './stateStore'.
 */

const { isDemoActive, setDemoActive, muatState } = require('./stateStore')

module.exports = { isDemoActive, setDemoActive, muatState }
