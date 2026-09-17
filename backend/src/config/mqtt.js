const mqtt = require('mqtt')
const { isMaintenanceActive } = require('./maintenanceMode')
const { processSmartContainer, processChamber } = require('../services/iotProcessor')

const PREFIX = process.env.MQTT_TOPIC_PREFIX || 'mbg'
const BROKER_URL = process.env.MQTT_URL

let client = null
let metaCache = null

function topic(suffix) {
  return `${PREFIX}/${suffix}`
}

function getClient() {
  return client
}

function publish(topicName, message, opts = {}) {
  if (!client) return false
  client.publish(topicName, message, opts)
  return true
}

function maintenanceTopic() {
  return `${PREFIX}/maintenance`
}

function publishMaintenanceState() {
  publish(maintenanceTopic(), JSON.stringify({ aktif: isMaintenanceActive() }), { retain: true })
}

function startMqtt() {
  if (!BROKER_URL) {
    console.log('MQTT_URL tidak diatur, transport MQTT dimatikan.')
    return null
  }

  client = mqtt.connect(BROKER_URL, {
    username: process.env.MQTT_USERNAME || undefined,
    password: process.env.MQTT_PASSWORD || undefined,
    reconnectPeriod: 5000,
    connectTimeout: 10000,
    keepalive: 30
  })

  client.on('connect', () => {
    client.subscribe(`${PREFIX}/smart-container/meta`)
    client.subscribe(`${PREFIX}/smart-container/foto`)
    client.subscribe(`${PREFIX}/maggot-chamber`)
    publishMaintenanceState()
    console.log(`MQTT terhubung ke ${BROKER_URL} (prefix "${PREFIX}")`)
  })

  client.on('error', (err) => {
    console.error('MQTT error:', err.message)
  })

  client.on('message', async (messageTopic, payload) => {
    const suffix = messageTopic.startsWith(`${PREFIX}/`) ? messageTopic.slice(PREFIX.length + 1) : messageTopic
    if (!suffix) return

    try {
      if (suffix === 'smart-container/meta') {
        try {
          const parsed = JSON.parse(payload.toString())
          metaCache = { beratKg: Number(parsed.beratKg) || 0, ts: Date.now() }
        } catch (err) {}
        return
      }

      if (suffix === 'smart-container/foto') {
        const beratKg = metaCache && Date.now() - metaCache.ts < 30000 ? metaCache.beratKg : 0
        const hasil = await processSmartContainer(payload, beratKg)
        publish(topic('smart-container/result'), JSON.stringify(hasil))
        return
      }

      if (suffix === 'maggot-chamber') {
        const data = JSON.parse(payload.toString())
        const hasil = await processChamber(data)
        publish(topic('maggot-chamber/result'), JSON.stringify(hasil))
        return
      }
    } catch (err) {
      console.error('MQTT message gagal diproses:', err.message)
    }
  })

  return client
}

module.exports = { startMqtt, getClient, publish, publishMaintenanceState, PREFIX, topic, maintenanceTopic }