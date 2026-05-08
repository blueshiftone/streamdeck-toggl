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
      document.getElementById('apiFrequency').value = payload.apiFrequency ?? 600
      if (payload.label) document.getElementById('label').value = payload.label
      if (payload.activity) document.getElementById('activity').value = payload.activity
      document.getElementById('billable').value = payload.billableToggle ? 1 : 0
      document.getElementById('trackingmode').value = payload.trackingMode ?? (payload.fallbackToggle ? 2 : 0) // handle old fallback toggle for backwards compatibility
      
      const apiToken = document.getElementById('apitoken').value

      document.querySelector('.hiddenAll').classList.remove('hiddenAll')

      apiToken && updateWorkspaces(apiToken).then(e => {
        if (payload.workspaceId) {
          document.getElementById('workspaceError').classList.add('hiddenError')
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

          updateTags(apiToken, payload.workspaceId).then(() => {
            if (payload.tagIds && payload.tagIds.length > 0) {
              document.querySelectorAll('#tagList input[type="checkbox"]').forEach(cb => {
                cb.checked = payload.tagIds.includes(Number(cb.value))
              })
              updateTagPreview()
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
      apiFrequency: document.getElementById('apiFrequency').value,
      label: document.getElementById('label').value,
      activity: document.getElementById('activity').value,
      workspaceId: document.getElementById('wid').value,
      projectId: document.getElementById('pid').value,
      taskId: document.getElementById('tid').value,
      tagIds: Array.from(document.querySelectorAll('#tagList input:checked')).map(cb => Number(cb.value)),
      billableToggle: document.getElementById('billable').value == 1 ?  true : false,
      trackingMode: document.getElementById('trackingmode').value
    }
  }))
}

function setAPIToken () {
  document.getElementById('wid').innerHTML = ''
  document.getElementById('pid').innerHTML = ''
  updateWorkspaces(document.getElementById('apitoken').value)
  sendSettings()
}

function setWorkspace () {
  document.getElementById('workspaceError').classList.add('hiddenError')
  updateProjects(document.getElementById('apitoken').value, document.getElementById('wid').value)
  updateTags(document.getElementById('apitoken').value, document.getElementById('wid').value)
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
    log("Error in updateTasks: " + (e instanceof Error ? e.message : typeof e === "string" ? e : String(e)))
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
    log("Error in updateProjects: " + (e instanceof Error ? e.message : typeof e === "string" ? e : String(e)))
  }
}

async function updateTags (apiToken, workspaceId) {
  try {
    await getTags(apiToken, workspaceId).then(tagsData => {
      const listEl = document.getElementById('tagList')
      listEl.innerHTML = ''
      if (tagsData.length > 0) {
        tagsData.sort((a, b) => a.name.localeCompare(b.name))
        for (const tag of tagsData) {
          const label = document.createElement('label')
          label.className = 'tag-item'
          const cb = document.createElement('input')
          cb.type = 'checkbox'
          cb.value = tag.id.toString()
          cb.dataset.name = tag.name
          cb.onchange = () => { updateTagPreview(); sendSettings() }
          label.appendChild(cb)
          label.appendChild(document.createTextNode(tag.name))
          listEl.appendChild(label)
        }
        document.getElementById('tagWrapper').classList.remove('hidden')
      } else {
        document.getElementById('tagWrapper').classList.add('hidden')
      }
      updateTagPreview()
    })
  } catch (e) {
    document.getElementById('tagWrapper').classList.add('hidden')
    log("Error in updateTags: " + (e instanceof Error ? e.message : typeof e === "string" ? e : String(e)))
  }
}

function toggleTagDropdown () {
  const panel = document.getElementById('tagPanel')
  const isOpen = !panel.classList.contains('hidden')
  panel.classList.toggle('hidden', isOpen)
  if (!isOpen) document.getElementById('tagSearch').focus()
}

function filterTags () {
  const query = document.getElementById('tagSearch').value.toLowerCase()
  document.querySelectorAll('#tagList .tag-item').forEach(item => {
    const name = item.querySelector('input').dataset.name.toLowerCase()
    item.style.display = name.includes(query) ? '' : 'none'
  })
}

function updateTagPreview () {
  const names = Array.from(document.querySelectorAll('#tagList input:checked')).map(cb => cb.dataset.name)
  document.getElementById('tagPreview').textContent = names.join(', ')
}

document.addEventListener('click', function (e) {
  const dropdown = document.getElementById('tagDropdown')
  if (dropdown && !dropdown.contains(e.target)) {
    document.getElementById('tagPanel')?.classList.add('hidden')
  }
})

async function updateWorkspaces (apiToken) {
  try {
    await getWorkspaces(apiToken).then(workspaceData => {
      document.getElementById('wid').innerHTML = '<option value="0"></option>'
      document.getElementById('errorMessage').innerHTML = ""
      document.getElementById('error').classList.add('hiddenError')
      document.getElementById('workspaceWrapper').classList.remove('hidden')
      document.getElementById('labelWrapper').classList.remove('hidden')
      document.getElementById('activityWrapper').classList.remove('hidden')
      document.getElementById('workspaceError').classList.remove('hiddenError')
      const selectEl = document.getElementById('wid')

      for (ws in workspaceData) {
        const optionEl = document.createElement('option')
        optionEl.innerText = workspaceData[ws].name
        optionEl.value = workspaceData[ws].id.toString()
        selectEl.append(optionEl)
      }
    })
  } catch (e) {
    document.getElementById('errorMessage').innerHTML = (e instanceof Error ? e.message : typeof e === "string" ? e : String(e))
    document.getElementById('error').classList.remove('hiddenError')
    document.getElementById('workspaceWrapper').classList.add('hidden')
    document.getElementById('labelWrapper').classList.add('hidden')
    document.getElementById('activityWrapper').classList.add('hidden')
    document.getElementById('projectWrapper').classList.add('hidden')
    document.getElementById('taskWrapper').classList.add('hidden')
    document.getElementById('tagWrapper').classList.add('hidden')
    document.getElementById('workspaceError').classList.add('hiddenError')
    log("Error in updateWorkspaces: " + (e instanceof Error ? e.message : typeof e === "string" ? e : String(e)))
  }
}

function clearTogglCache() {
  clearCache();
  alert("Cleared local cache of Toggl workspace, project and task data.");
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

async function getTags(apiToken, workspaceId) {
  const key = `tags:${apiToken}:${workspaceId}`
  return withCache(key, async () => {
    const response = await fetch(
      `${togglBaseUrl}/workspaces/${workspaceId}/tags`,
      { headers: { Authorization: `Basic ${btoa(`${apiToken}:api_token`)}` } }
    )
    if (!response.ok) throw new Error(`Toggl API Error: ${await response.text()} (${response.status})`)
    const json = await response.json()
    return Array.isArray(json) ? json : []
  })
}

async function getTasks(apiToken, workspaceId, projectId) {
  const key = `tasks:${apiToken}:${workspaceId}:${projectId}`;
  return withCache(key, async () => {
    const response = await fetch(
      `${togglBaseUrl}/workspaces/${workspaceId}/projects/${projectId}/tasks`,
      { headers: { Authorization: `Basic ${btoa(`${apiToken}:api_token`)}` } }
    );
    if (!response.ok) throw new Error(`Toggl API Error: ${await response.text()} (${response.status})`);
    const json = await response.json();
    return Array.isArray(json) ? json : [];
  });
}

async function getProjects(apiToken, workspaceId) {
  const key = `projects:${apiToken}:${workspaceId}`;
  return withCache(key, async () => {
    let data = [];
    for (let page = 1; page <= 100; page++) {
      const response = await fetch(
        `${togglBaseUrl}/workspaces/${workspaceId}/projects?page=${page}&per_page=200`,
        { headers: { Authorization: `Basic ${btoa(`${apiToken}:api_token`)}` } }
      );
      if (!response.ok) throw new Error(`Toggl API Error: ${await response.text()} (${response.status})`);
      const chunk = await response.json();
      if (!Array.isArray(chunk) || chunk.length === 0) break;
      data = data.concat(chunk);
    }
    return data;
  });
}

async function getWorkspaces(apiToken) {
  const key = `workspaces:${apiToken}`;
  return withCache(key, async () => {
    const response = await fetch(
      `${togglBaseUrl}/me/workspaces`,
      { headers: { Authorization: `Basic ${btoa(`${apiToken}:api_token`)}` } }
    );
    if (!response.ok) throw new Error(`Toggl API Error: ${await response.text()} (${response.status})`);
    const json = await response.json();
    return Array.isArray(json) ? json : [];
  });
}

function log(message) {
  websocket.send(JSON.stringify({
    event: "logMessage",
    payload: { message }
  }));
}

// ---- IndexedDB cache (1 hour TTL) ------------------------------------

const ONE_HOUR = 60 * 60 * 1000;
const DB_NAME = "togglCache";
const STORE = "cache";

async function withCache(key, fetcher, ttl = ONE_HOUR) {
  try {
    const cached = await getCache(key);
    if (cached && (Date.now() - cached.ts) <= ttl) {
      return cached.data;
    }
  } catch (_) { /* ignore cache read errors */ }

  const data = await fetcher();

  try {
    await setCache(key, { ts: Date.now(), data });
  } catch (_) { /* ignore cache write errors */ }

  return data;
}

function clearCache() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("Cache deletion blocked."));
  });
}

function getCache(key) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(STORE, "readonly");
      const getReq = tx.objectStore(STORE).get(key);
      getReq.onsuccess = () => { resolve(getReq.result); db.close(); };
      getReq.onerror = () => { reject(getReq.error); db.close(); };
    };
    req.onerror = () => reject(req.error);
  });
}

function setCache(key, value) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(STORE, "readwrite");
      const putReq = tx.objectStore(STORE).put(value, key);
      putReq.onsuccess = () => { resolve(); db.close(); };
      putReq.onerror = () => { reject(putReq.error); db.close(); };
    };
    req.onerror = () => reject(req.error);
  });
}