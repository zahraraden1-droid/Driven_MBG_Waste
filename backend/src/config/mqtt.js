const mqtt = require('mqtt')
const { isMaintenanceActive } = require('./maintenanceMode')
const { processSmartContainer, processChamber } = require('../services/iotProcessor')
const registry = require('./deviceRegistry')

const PREFIX = process.env.MQTT_TOPIC_PREFIX || 'mbg'
const BROKER_URL = process.env.MQTT_URL

const CMD_TOPICS = {
  'smart-container': 'smart-container/cmd',
  'maggot-chamber': 'maggot-chamber/cmd'
}

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

function publishCommand(deviceId, payload) {
  const suffix = CMD_TOPICS[deviceId]
  if (!suffix) return false
  return publish(topic(suffix), typeof payload === 'string' ? payload : JSON.stringify(payload))
}

function maintenanceTopic() {
  return `${PREFIX}/maintenance`
}

function publishMaintenanceState() {
  publish(maintenanceTopic(), JSON.stringify({ aktif: isMaintenanceActive() }), { retain: true })
}

function safeParse(payload) {
  try {
    return JSON.parse(payload.toString())
  } catch (err) {
    return null
  }
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
    client.subscribe(`${PREFIX}/smart-container/status`)
    client.subscribe(`${PREFIX}/maggot-chamber/status`)
    client.subscribe(`${PREFIX}/smart-container/cmd-result`)
    client.subscribe(`${PREFIX}/maggot-chamber/cmd-result`)
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
        const parsed = safeParse(payload)
        if (parsed) {
          metaCache = { beratKg: Number(parsed.beratKg) || 0, ts: Date.now() }
          registry.touch('smart-container', { beratKg: metaCache.beratKg })
        }
        return
      }

      if (suffix === 'smart-container/foto') {
        const beratKg = metaCache && Date.now() - metaCache.ts < 30000 ? metaCache.beratKg : 0
        const hasil = await processSmartContainer(payload, beratKg)
        registry.touch('smart-container', { beratKg, statusProses: hasil.status })
        publish(topic('smart-container/result'), JSON.stringify(hasil))
        return
      }

      if (suffix === 'maggot-chamber') {
        const data = safeParse(payload)
        if (!data) return

        const calibration = {}
        if (typeof data.scaleFaktor === 'number') calibration.scaleFaktor = data.scaleFaktor
        if (typeof data.mq135R0 === 'number') calibration.mq135R0 = data.mq135R0
        if (Object.keys(calibration).length) registry.updateCalibration('maggot-chamber', calibration)

        registry.touch('maggot-chamber', data)
        const hasil = await processChamber(data)
        publish(topic('maggot-chamber/result'), JSON.stringify(hasil))
        return
      }

      if (suffix === 'smart-container/status') {
        const parsed = safeParse(payload)
        registry.setStatusPesan('smart-container', parsed)
        registry.touch('smart-container')
        return
      }

      if (suffix === 'maggot-chamber/status') {
        const parsed = safeParse(payload)
        registry.setStatusPesan('maggot-chamber', parsed)
        registry.touch('maggot-chamber')
        return
      }

      if (suffix === 'smart-container/cmd-result' || suffix === 'maggot-chamber/cmd-result') {
        const deviceId = suffix === 'smart-container/cmd-result' ? 'smart-container' : 'maggot-chamber'
        registry.setCmdResult(deviceId, safeParse(payload))
        registry.touch(deviceId)
        return
      }
    } catch (err) {
      console.error('MQTT message gagal diproses:', err.message)
    }
  })

  return client
}

module.exports = { startMqtt, getClient, publish, publishCommand, publishMaintenanceState, PREFIX, topic, maintenanceTopic }