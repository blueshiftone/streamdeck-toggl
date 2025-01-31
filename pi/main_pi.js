/* eslint-disable no-unused-vars, no-undef */
const togglBaseUrl = 'https://api.track.toggl.com/api/v9'

let websocket = null
let uuid = null

function connectElgatoStreamDeckSocket (inPort, inPropertyInspectorUUID, inRegisterEvent, inInfo, inActionInfo) {
  uuid = inPropertyInspectorUUID

  // Open the web socket (use 127.0.0.1 vs localhost because windows is "slow" resolving 'localhost')
  websocket = new WebSocket('ws://127.0.0.1:' + inPort)

  websocket.onopen = function () {
    // WebSocket is connected, register the Property Inspector
    websocket.send(JSON.stringify({
      event: inRegisterEvent,
      uuid: inPropertyInspectorUUID
    }))

    // Request settings
    websocket.send(JSON.stringify({
      event: 'getSettings',
      context: uuid
    }))
  }

  websocket.onmessage = function (evt) {
    // Received message from Stream Deck
    const jsonObj = JSON.parse(evt.data)

    if (jsonObj.event === 'didReceiveSettings') {
      const payload = jsonObj.payload.settings

      if (payload.apiToken) document.getElementById('apitoken').value = payload.apiToken
      if (payload.label) document.getElementById('label').value = payload.label
      if (payload.activity) document.getElementById('activity').value = payload.activity
      document.getElementById('billable').value = payload.billableToggle ? 1 : 0
      document.getElementById('trackingmode').value = payload.trackingMode ?? (payload.fallbackToggle ? 2 : 0) // handle old fallback toggle for backwards compatibility

      const apiToken = document.getElementById('apitoken').value

      document.querySelector('.hiddenAll').classList.remove('hiddenAll')

      apiToken && updateWorkspaces(apiToken).then(e => {
        if (payload.workspaceId) {
          document.getElementById('wid').value = payload.workspaceId

          updateProjects(apiToken, payload.workspaceId).then(e => {
            if (payload.projectId) {
              document.getElementById('pid').value = payload.projectId

              updateTasks(apiToken, payload.workspaceId, payload.projectId).then(e => {
                if (payload.taskId)
                  document.getElementById('tid').value = payload.taskId

              })
            }
          })
        }
      })
    }
  }
}

function sendSettings () {
  websocket && (websocket.readyState === 1) &&
  websocket.send(JSON.stringify({
    event: 'setSettings',
    context: uuid,
    payload: {
      apiToken: document.getElementById('apitoken').value,
      label: document.getElementById('label').value,
      activity: document.getElementById('activity').value,
      workspaceId: document.getElementById('wid').value,
      projectId: document.getElementById('pid').value,
      taskId: document.getElementById('tid').value,
      billableToggle: document.getElementById('billable').value == 1 ?  true : false,
      trackingMode: document.getElementById('trackingmode').value
    }
  }))
}

function setAPIToken () {
  document.getElementById('wid').innerHTML = ''
  document.getElementById('pid').innerHTML = ''
  updateWorkspaces(document.getElementById('apitoken').value)
  document.getElementById('workspaceError').classList.remove('hiddenError')
  sendSettings()
}

function setWorkspace () {
  updateProjects(document.getElementById('apitoken').value, document.getElementById('wid').value)
  sendSettings()
}

function setProject () {
  updateTasks(document.getElementById('apitoken').value, document.getElementById('wid').value, document.getElementById('pid').value)
  sendSettings()
}

async function updateTasks (apiToken, workspaceId, projectId) {
  try {
    await getTasks(apiToken, workspaceId, projectId).then(tasksData => {
      document.getElementById('tid').innerHTML = '<option value="0"></option>'
      document.getElementById('taskWrapper').classList.remove('hidden')
      const selectEl = document.getElementById('tid')

      if (tasksData != null) tasksData.sort((a, b) => { return (a.active === b.active) ? 0 : a.active ? -1 : 1; });

      for (taskNum in tasksData) {
        const optionEl = document.createElement('option')
        optionEl.innerText = tasksData[taskNum].name + (tasksData[taskNum].active ? `` : ` (Done)`)
        optionEl.value = tasksData[taskNum].id.toString()
        selectEl.append(optionEl)
      }
    })
  } catch (e) {
    document.getElementById('taskWrapper').classList.add('hidden')
  }
}

async function updateProjects (apiToken, workspaceId) {
  try {
    await getProjects(apiToken, workspaceId).then(projectsData => {
      document.getElementById('pid').innerHTML = '<option value="0"></option>'
      document.getElementById('workspaceError').classList.add('hiddenError')
      document.getElementById('projectWrapper').classList.remove('hidden')
      document.getElementById('billableWrapper').classList.remove('hidden')
      document.getElementById('trackingModeWrapper').classList.remove('hidden')
      const selectEl = document.getElementById('pid')

      if (projectsData != null) projectsData.sort((a, b) => { return (a.active === b.active) ? 0 : a.active ? -1 : 1; });

      for (projectNum in projectsData) {
        const optionEl = document.createElement('option')
        optionEl.innerText = projectsData[projectNum].name + (projectsData[projectNum].active ? `` : ` (Archived)`)
        optionEl.value = projectsData[projectNum].id.toString()
        selectEl.append(optionEl)
      }
    })
  } catch (e) {
    document.getElementById('taskWrapper').classList.add('hidden')
    document.getElementById('projectWrapper').classList.add('hidden')
    document.getElementById('billableWrapper').classList.add('hidden')
    document.getElementById('trackingModeWrapper').classList.add('hidden')
  }
}

async function updateWorkspaces (apiToken) {
  try {
    await getWorkspaces(apiToken).then(workspaceData => {
      document.getElementById('wid').innerHTML = '<option value="0"></option>'
      document.getElementById('error').classList.add('hiddenError')
      document.getElementById('labelWrapper').classList.remove('hidden')
      document.getElementById('activityWrapper').classList.remove('hidden')
      document.getElementById('workspaceWrapper').classList.remove('hidden')
      const selectEl = document.getElementById('wid')

      for (ws in workspaceData) {
        const optionEl = document.createElement('option')
        optionEl.innerText = workspaceData[ws].name
        optionEl.value = workspaceData[ws].id.toString()
        selectEl.append(optionEl)
      }
    })
  } catch (e) {
    document.getElementById('error').classList.remove('hiddenError')
    document.getElementById('workspaceWrapper').classList.add('hidden')
    document.getElementById('labelWrapper').classList.add('hidden')
    document.getElementById('activityWrapper').classList.add('hidden')
    document.getElementById('projectWrapper').classList.add('hidden')
    document.getElementById('taskWrapper').classList.add('hidden')
    document.getElementById('workspaceError').classList.add('hiddenError')
    console.log(e)
  }
}

async function getTasks (apiToken, workspaceId, projectId) {
  let data = [];

  const response = await fetch(
      `${togglBaseUrl}/workspaces/${workspaceId}/projects/${projectId}/tasks`, {
        method: 'GET',
        headers: {
          Authorization: `Basic ${btoa(`${apiToken}:api_token`)}`
        }
      })
  const responseData = await response.json()
  if (responseData.length == 0) return
  data = data.concat(responseData)

  return data
}

async function getProjects (apiToken, workspaceId) {
  let data = [];
  for(let page = 1; page <= 100; page++) {
    const response = await fetch(
      `${togglBaseUrl}/workspaces/${workspaceId}/projects?&page=${page}&per_page=200`, {
        method: 'GET',
        headers: {
          Authorization: `Basic ${btoa(`${apiToken}:api_token`)}`
        }
      })
    const responseData = await response.json()
    if (responseData.length == 0) break
    data = data.concat(responseData)
  }
  return data
}

async function getWorkspaces (apiToken) {
  const response = await fetch(
    `${togglBaseUrl}/me/workspaces`, {
      method: 'GET',
      headers: {
        Authorization: `Basic ${btoa(`${apiToken}:api_token`)}`
      }
    })
  const data = await response.json()
  return data
}

function openPage (site) {
  websocket && (websocket.readyState === 1) &&
  websocket.send(JSON.stringify({
    event: 'openUrl',
    payload: {
      url: 'https://' + site
    }
  }))
}
