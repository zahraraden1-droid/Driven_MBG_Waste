/*
 * Mode pemeliharaan.
 *
 * Sejak state dipindahkan ke database (lihat stateStore.js), modul ini menjadi
 * delegasi tipis demi kompatibilitas pemanggil lama.
 *
 * CATATAN PERUBAHAN PERILAKU:
 *   setMaintenanceActive() dahulu SINKRON, kini ASYNC karena harus menulis ke
 *   database. Pemanggil wajib memakai `await`. isMaintenanceActive() tetap sinkron.
 *
 * Untuk kode baru, impor langsung dari './stateStore'.
 */

const {
  isMaintenanceActive,
  setMaintenanceActive,
  muatState
} = require('./stateStore')

module.exports = { isMaintenanceActive, setMaintenanceActive, muatState }
