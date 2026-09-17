const { isDemoActive } = require('../config/demoMode')
const demoData = require('../data/demoData')

const AI_BASE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000'

async function callLocalAi(path, payload) {
  const response = await fetch(`${AI_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    throw new Error(`AI service merespon dengan status ${response.status}`)
  }

  return response.json()
}

async function getWastePrediction(riwayat) {
  if (isDemoActive()) {
    return demoData.aiPrediction
  }

  try {
    return await callLocalAi('/predict/waste', { riwayat })
  } catch (err) {
    return { error: true, message: err.message }
  }
}

async function getMenuCorrelation() {
  if (isDemoActive()) {
    return demoData.aiCorrelationTable
  }

  try {
    return await callLocalAi('/analyze/menu-correlation', {})
  } catch (err) {
    return { error: true, message: err.message }
  }
}

module.exports = { getWastePrediction, getMenuCorrelation }
