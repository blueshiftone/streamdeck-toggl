/* eslint-disable no-unused-vars, no-undef */
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
  sendSettings()
}

function openPage(site) {
  websocket && (websocket.readyState === 1) &&
    websocket.send(JSON.stringify({
      event: 'openUrl',
      payload: { url: 'https://' + site }
    }))
}
