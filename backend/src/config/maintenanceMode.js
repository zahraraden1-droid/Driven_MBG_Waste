let maintenanceActive = false

function isMaintenanceActive() {
  return maintenanceActive
}

function setMaintenanceActive(value) {
  maintenanceActive = Boolean(value)
  return maintenanceActive
}

module.exports = { isMaintenanceActive, setMaintenanceActive }