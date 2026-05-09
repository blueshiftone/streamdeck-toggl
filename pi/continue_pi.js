/* eslint-disable no-unused-vars, no-undef */
const togglBaseUrl = 'https://api.track.toggl.com/api/v9'

let websocket = null
let uuid = null

function connectElgatoStreamDeckSocket(inPort, inPropertyInspectorUUID, inRegisterEvent, inInfo, inActionInfo) {
  uuid = inPropertyInspectorUUID

  websocket = new WebSocket('ws://127.0.0.1:' + inPort)

  websocket.onopen = function () {
    websocket.send(JSON.stringify({
      event: inRegisterEvent,
      uuid: inPropertyInspectorUUID
    }))
    websocket.send(JSON.stringify({
      event: 'getSettings',
      context: uuid
    }))
  }

  websocket.onmessage = function (evt) {
    const jsonObj = JSON.parse(evt.data)

    if (jsonObj.event === 'didReceiveSettings') {
      const payload = jsonObj.payload.settings

      if (payload.apiToken) document.getElementById('apitoken').value = payload.apiToken
      document.getElementById('apiFrequency').value = payload.apiFrequency ?? 600

      document.querySelector('.hiddenAll').classList.remove('hiddenAll')

      const apiToken = document.getElementById('apitoken').value
      if (apiToken) loadLastEntry(apiToken)
    }
  }
}

function sendSettings() {
  websocket && (websocket.readyState === 1) &&
    websocket.send(JSON.stringify({
      event: 'setSettings',
      context: uuid,
      payload: {
        apiToken: document.getElementById('apitoken').value,
        apiFrequency: document.getElementById('apiFrequency').value
      }
    }))
}

function setAPIToken() {
  const apiToken = document.getElementById('apitoken').value
  sendSettings()
  if (apiToken) loadLastEntry(apiToken)
}

async function loadLastEntry(apiToken) {
  const display = document.getElementById('lastEntryDisplay')
  const wrapper = document.getElementById('lastEntryWrapper')
  display.textContent = 'Loading…'
  wrapper.style.display = ''

  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10)
    const response = await fetch(
      `${togglBaseUrl}/me/time_entries?start_date=${sevenDaysAgo}`,
      { headers: { Authorization: `Basic ${btoa(`${apiToken}:api_token`)}` } }
    )
    if (!response.ok) throw new Error(`Toggl API Error: ${await response.text()} (${response.status})`)
    const entries = await response.json()
    const lastEntry = Array.isArray(entries) ? entries.find(e => e.duration > 0) : null

    display.textContent = lastEntry
      ? (lastEntry.description || '(no description)')
      : 'No recent entries found'
  } catch (e) {
    display.textContent = 'Could not load — check API token'
  }
}

function openPage(site) {
  websocket && (websocket.readyState === 1) &&
    websocket.send(JSON.stringify({
      event: 'openUrl',
      payload: { url: 'https://' + site }
    }))
}
