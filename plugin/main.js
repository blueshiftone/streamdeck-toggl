/* eslint-disable no-unused-vars, no-undef */
const togglBaseUrl = 'https://api.track.toggl.com/api/v9'

let websocket = null
let currentButtons = new Map()
let continueButtons = new Map()
let refreshInterval = 600000
let refreshLoopActive = false
let refreshingButtons = false
let lastRefreshTime = null
let currentTimeEntry = null

function connectElgatoStreamDeckSocket(inPort, inPluginUUID, inRegisterEvent, inInfo) {

  // Open the web socket (use 127.0.0.1 vs localhost because windows is "slow" resolving 'localhost')
  websocket = new WebSocket('ws://127.0.0.1:' + inPort)

  websocket.onopen = function () {
    // WebSocket is connected, register the plugin
    websocket.send(JSON.stringify(json = {
      event: inRegisterEvent,
      uuid: inPluginUUID
    }))
  }

  websocket.onmessage = async function (evt) {
    // Received message from Stream Deck
    const jsonObj = JSON.parse(evt.data)
    const { event, context, payload, action } = jsonObj
    const isContinue = action === 'one.blueshift.streamdeck.toggl.continue'

    switch (event) {
      case 'keyDown':
        if (isContinue) {
          if (!payload.settings.apiToken) {
            showAlert(context)
          } else {
            await toggleContinue(context, payload.settings)
          }
        } else {
          if (!payload.settings.apiToken || !payload.settings.workspaceId) {
            showAlert(context)
          } else {
            await toggle(payload.settings)
          }
        }
        break
      case 'willAppear':
        if (!payload.settings.apiToken) {
          showAlert(context)
        } else if (!payload.isInMultiAction) {
          if (isContinue) {
            addContinueButton(context, payload.settings)
          } else {
            addButton(context, payload.settings)
          }
        }
        break
      case 'willDisappear':
        if (!payload.isInMultiAction) {
          if (isContinue) {
            removeContinueButton(context)
          } else {
            removeButton(context)
          }
        }
        break
      case 'didReceiveSettings':
        if (!payload.isInMultiAction) {
          if (isContinue) {
            removeContinueButton(context)
            if (payload.settings.apiToken) {
              addContinueButton(context, payload.settings)
            }
          } else {
            removeButton(context)
            if (payload.settings.apiToken) {
              addButton(context, payload.settings)
            }
          }
        }
        break
    }
    await refreshButtons()
  }
}

function removeButton(context) {
  currentButtons.delete(context)
  updateRefreshInterval()
}

function addButton(context, settings) {
  currentButtons.set(context, settings)
  updateRefreshInterval()
  initRefreshLoop()
}

function addContinueButton(context, settings) {
  continueButtons.set(context, settings)
  updateRefreshInterval()
  initRefreshLoop()
}

function removeContinueButton(context) {
  continueButtons.delete(context)
  updateRefreshInterval()
}

function updateRefreshInterval() {
  const allSettings = [...currentButtons.values(), ...continueButtons.values()]
  refreshInterval = allSettings.length > 0
    ? Math.min(...allSettings.map(s => s.apiFrequency || 600)) * 1000
    : 600000
}

function initRefreshLoop() {
  if (refreshLoopActive) return
  refreshLoopActive = true
  runRefreshLoop()
}

function runRefreshLoop() {
  if (currentButtons.size === 0 && continueButtons.size === 0) {
    refreshLoopActive = false
  } else {
    refreshButtons();
    setTimeout(runRefreshLoop, 1000)
  }
}

function matchButton(entry, button) {
  return (entry
    && entry.workspace_id == button.workspaceId
    && (entry.project_id ?? 0) == button.projectId
    && (entry.task_id ?? 0) == button.taskId
    && (entry.description == button.activity || button.trackingMode == 1 || (button.trackingMode == 3 && button.activity && entry.description?.startsWith(button.activity)))
  )
}

function matchWithFallback(entry, button) {
  // Compares entry (from API) with button (from config) to check for match
  // Returns false for no match, true for exact match and "fallback" if button
  // is configured as fallback and this counts as a fallback match
  if (!entry) {
    return false
  }
  if (matchButton(entry, button)) {
    return true
  }
  if (button.trackingMode != 1) {
    return false
  }
  // No exact match, but button is fallback button. If no other button matches
  // exactly, count as fallback match, otherwise as no match
  if(![...currentButtons.values()].some(otherButton => matchButton(entry, otherButton))) {
    return "fallback"
  } else {
    return false
  }
}

async function refreshButtons() {
  if (refreshingButtons) return
  refreshingButtons = true

  var tokens = new Set([
    ...[...currentButtons.values()].map(s => s.apiToken),
    ...[...continueButtons.values()].map(s => s.apiToken)
  ])

  for (const apiToken of tokens) {

    if (!lastRefreshTime || (Date.now() - lastRefreshTime) > refreshInterval) {
      try {
        await refreshCurrentEntry(apiToken)
      } catch (_) { }
    }

    // Update regular buttons
    currentButtons.forEach((settings, context) => {
       // We're in a forEach, this is effectively a continue
      if (apiToken != settings.apiToken) return

      // Default label
      let label = settings.label

      // Find out if exact match or fallback match or no match
      const matchResult = matchWithFallback(currentTimeEntry, settings)
      if(matchResult == "fallback") {
        label = currentTimeEntry.description || "Other Task"
      }

      if (matchResult) {
        setState(context, 0)
        setTitle(context, `${formatElapsed(currentTimeEntry.start)}\n\n\n${label}`)
      } else { // if not, make sure it's 'off'
        setState(context, 1)
        setTitle(context, label)
      }
    })

    // Update continue buttons
    continueButtons.forEach((settings, context) => {
      if (apiToken != settings.apiToken) return

      if (currentTimeEntry) {
        setState(context, 0)
        setTitle(context, `${formatElapsed(currentTimeEntry.start)}\n\n\n${currentTimeEntry.description || ''}`)
      } else {
        setState(context, 1)
        setTitle(context, settings.label || 'Continue')
      }
    })
  }
  refreshingButtons = false;
}

function formatElapsed(startFromToggl) {
  const elapsed = Math.floor(Date.now()/1000) - Math.floor(new Date(startFromToggl).getTime()/1000)
  return formatSeconds(elapsed)
}

function formatSeconds(seconds) {
  if (seconds < 3600)
    return leadingZero(Math.floor(seconds/60)) + ':' + leadingZero(seconds % 60)
  return leadingZero(Math.floor(seconds/3600)) + ':' + formatSeconds(seconds % 3600)
}

function leadingZero(val) {
  if (val < 10)
    return '0' + val
  return val
}

async function toggle(settings) {
  const { apiToken, apiFrequency, activity, taskId, projectId, workspaceId, billableToggle, trackingMode, tagIds } = settings

  if (!currentTimeEntry) {
    // Not running? Start a new one
    await startEntry(apiToken, activity, workspaceId, projectId, taskId, billableToggle, tagIds).then(v=>refreshButtons())
  } else {
    if (matchWithFallback(currentTimeEntry, settings)) {
      // The one running is "this one" - toggle to stop
      await stopEntry(apiToken, currentTimeEntry.id, workspaceId).then(v=>refreshButtons())
    } else {
      // Just start the new one, old one will stop automatically
      await startEntry(apiToken, activity, workspaceId, projectId, taskId, billableToggle, tagIds).then(v=>refreshButtons())
    }
  }
}

async function toggleContinue(context, settings) {
  const { apiToken } = settings

  if (currentTimeEntry) {
    await stopEntry(apiToken, currentTimeEntry.id, currentTimeEntry.workspace_id).then(() => refreshButtons())
  } else {
    try {
      const lastEntry = await getLastEntry(apiToken)
      if (!lastEntry) {
        showAlert(context)
        return
      }
      await startEntry(
        apiToken,
        lastEntry.description,
        lastEntry.workspace_id,
        lastEntry.project_id,
        lastEntry.task_id,
        lastEntry.billable,
        lastEntry.tag_ids
      ).then(() => refreshButtons())
    } catch (e) {
      showAlert(context)
    }
  }
}

// Toggl API Helpers

async function startEntry(apiToken = isRequired(), activity = "Time Entry created by Toggl for Stream Deck", workspaceId = 0, projectId = 0, taskId = 0, billableToggle = false, tagIds = []
) {
  try {
    const date = new Date();
    const body = {
      start: date.toISOString().substring(0, 19) + "Z",
      description: activity,
      wid: Number(workspaceId),
      billable: billableToggle,
      created_with: "Stream Deck",
      duration: -1
    };

    if (projectId && projectId != 0) body.project_id = Number(projectId);
    if (taskId && taskId != 0) body.task_id = Number(taskId);
    if (Array.isArray(tagIds) && tagIds.length > 0) body.tag_ids = tagIds.map(Number);

    const response = await fetch(
      `${togglBaseUrl}/workspaces/${workspaceId}/time_entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Basic ${btoa(`${apiToken}:api_token`)}` },
        body: JSON.stringify(body)
      }
    );

    if (!response.ok) throw new Error(`Toggl API Error: ${await response.text()} (${response.status})`);

    const data = await response.json();
    currentTimeEntry = data;
    lastRefreshTime = Date.now();
  } catch (e) {
    log("Error in startEntry: " + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
}

async function stopEntry(apiToken = isRequired(), entryId = isRequired(), workspaceId = 0) {
  try {
    const response = await fetch(
      `${togglBaseUrl}/workspaces/${workspaceId}/time_entries/${entryId}/stop`, {
        method: "PATCH",
        headers: { Authorization: `Basic ${btoa(`${apiToken}:api_token`)}` }
      }
    );
    if (!response.ok) throw new Error(`Toggl API Error: ${await response.text()} (${response.status})`);
    currentTimeEntry = null;
    lastRefreshTime = Date.now();
  } catch (e) {
    log("Error in stopEntry: " + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
}

async function refreshCurrentEntry(apiToken = isRequired()) {
  try {
    const response = await fetch(
      `${togglBaseUrl}/me/time_entries/current`, {
        method: "GET",
        headers: { Authorization: `Basic ${btoa(`${apiToken}:api_token`)}`}
      }
    );
    if (!response.ok) throw new Error(`Toggl API Error: ${await response.text()} (${response.status})`);
    const data = await response.json();
    currentTimeEntry = data;
    lastRefreshTime = Date.now();
  } catch (e) {
    log("Error in refreshCurrentEntry: " + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
}

async function getLastEntry(apiToken = isRequired()) {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10)
    const response = await fetch(
      `${togglBaseUrl}/me/time_entries?start_date=${sevenDaysAgo}`, {
        method: "GET",
        headers: { Authorization: `Basic ${btoa(`${apiToken}:api_token`)}` }
      }
    );
    if (!response.ok) throw new Error(`Toggl API Error: ${await response.text()} (${response.status})`);
    const entries = await response.json();
    if (!Array.isArray(entries)) return null;
    // Entries are newest-first; find first one that is stopped (duration > 0)
    return entries.find(e => e.duration > 0) ?? null;
  } catch (e) {
    log("Error in getLastEntry: " + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
}

// Set Button State
function setState(context = isRequired(), state = isRequired()) {
  websocket && (websocket.readyState === 1) &&
    websocket.send(JSON.stringify({
      event: 'setState',
      context: context,
      payload: {
        state: state
      }
    }))
}

// Set Button Title
function setTitle(context = isRequired(), title = '') {
  websocket && (websocket.readyState === 1) && websocket.send(JSON.stringify({
    event: 'setTitle',
    context: context,
    payload: {
      title: title
    }
  }))
}

function showAlert(context = isRequired()) {
  websocket && (websocket.readyState === 1) &&
    websocket.send(JSON.stringify({
      event: 'showAlert',
      context: context
    }))
}

function log(message) {
  websocket.send(JSON.stringify({
    event: "logMessage",
    payload: { message }
  }));
}

// Throw error when required argument is not supplied
const isRequired = () => {
  throw new Error('Missing required params')
}
