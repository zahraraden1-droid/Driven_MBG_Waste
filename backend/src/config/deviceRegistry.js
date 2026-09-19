/*
 * Registry status perangkat IoT (menggantikan dashboard ThingsBoard di sisi backend).
 * Menyimpan status online, telemetri terakhir, nilai kalibrasi, dan hasil perintah.
 */

const OFFLINE_MS = 120 * 1000 // smart container heartbeat 60s, chamber 30s

const devices = {
  'smart-container': {
    id: 'smart-container',
    nama: 'Smart Container',
    tipe: 'esp32-cam',
    online: false,
    lastSeen: null,
    lastTelemetry: null,
    statusPesan: null,
    calibration: {},
    cmdResult: null
  },
  'maggot-chamber': {
    id: 'maggot-chamber',
    nama: 'Maggot Chamber',
    tipe: 'esp8266',
    online: false,
    lastSeen: null,
    lastTelemetry: null,
    statusPesan: null,
    calibration: {},
    cmdResult: null
  }
}

function refreshOnline() {
  const now = Date.now()
  for (const device of Object.values(devices)) {
    device.online = device.lastSeen
      ? now - new Date(device.lastSeen).getTime() < OFFLINE_MS
      : false
  }
}

function touch(deviceId, telemetry = null) {
  const device = devices[deviceId]
  if (!device) return
  device.lastSeen = new Date().toISOString()
  if (telemetry) device.lastTelemetry = telemetry
}

function updateCalibration(deviceId, calibration) {
  const device = devices[deviceId]
  if (!device || !calibration) return
  device.calibration = { ...device.calibration, ...calibration }
}

function setStatusPesan(deviceId, pesan) {
  const device = devices[deviceId]
  if (!device) return
  device.statusPesan = pesan
  if (pesan && pesan.perangkat) {
    const calibration = {}
    if (typeof pesan.scaleFaktor === 'number') calibration.scaleFaktor = pesan.scaleFaktor
    if (typeof pesan.mq135R0 === 'number') calibration.mq135R0 = pesan.mq135R0
    if (Object.keys(calibration).length) updateCalibration(deviceId, calibration)
  }
}

function setCmdResult(deviceId, result) {
  const device = devices[deviceId]
  if (!device) return
  if (result && typeof result === 'object') result.waktu = new Date().toISOString()
  device.cmdResult = result
  if (result && result.perangkat) {
    const calibration = {}
    if (typeof result.scaleFaktor === 'number') calibration.scaleFaktor = result.scaleFaktor
    if (typeof result.mq135R0 === 'number') calibration.mq135R0 = result.mq135R0
    if (Object.keys(calibration).length) updateCalibration(deviceId, calibration)
  }
}

function getDevice(deviceId) {
  return devices[deviceId] || null
}

function getDevices() {
  refreshOnline()
  return Object.values(devices).map((device) => ({ ...device }))
}

module.exports = { getDevices, getDevice, touch, updateCalibration, setStatusPesan, setCmdResult }