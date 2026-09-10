let demoActive = process.env.DEMO_MODE === 'true'

function isDemoActive() {
  return demoActive
}

function setDemoActive(value) {
  demoActive = Boolean(value)
  return demoActive
}

module.exports = { isDemoActive, setDemoActive }
