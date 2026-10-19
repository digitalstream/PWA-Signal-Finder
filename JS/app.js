import { Compass } from './compass.js'
import { setupMenu, toggleSideMenu } from './menu.js'
import { LocationTracker } from './location.js'

// --- Constants & Global State ---
const DEBUG = false;
const R = 6371 // Earth's radius in kilometers
const MAX_DISPLAY_SITES = 4 // Display 4 sites (2 on top, 2 on bottom)

let globalDeclination = null
let declinationCoords = null
let declinationDate = null
let activationStarted = false
const arrowRotations = new WeakMap()

// GLOBAL VARIABLES
let globalTransmitters = []
let globalUserCoords = null
let transmittersToDisplay = []
let currentTrueRotation = 0
let selectedTransmitter = null
let sitePanelTrigger = null
const sitePanelBackground = new Map()

// The compass owns sensor access and smoothing; this file owns the page.
const compass = new Compass({
  onReading (reading) {
    currentTrueRotation = reading.heading
    updateArrowRotations()
  }
})

const locationTracker = new LocationTracker({
  onLocation: updateUserLocation,
  onStatus: updateLocationStatus
})

function setupLocationStatus () {
  if (document.getElementById('locationStatus')) return
  const section = document.querySelector('#sideMenu .menu-section')
  if (!section) return
  const status = document.createElement('p')
  status.id = 'locationStatus'
  status.className = 'menu-status'
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  status.textContent = 'Location not started'
  section.appendChild(status)
}

function updateLocationStatus ({ status, accuracy, hasLocation }) {
  const element = document.getElementById('locationStatus')
  if (!element) return
  const estimate = Number.isFinite(accuracy) ? `about ${Math.max(1, Math.round(accuracy))} m` : 'unknown'
  const previous = hasLocation ? ' Using last known location.' : ''
  const messages = {
    searching: `Finding your location…${previous}`,
    ready: `Location accuracy: ${estimate}`,
    weak: `Location signal is weak (${estimate}).`,
    paused: 'Location updates paused',
    stale: `Waiting for a fresh location.${previous}`,
    timeout: `Location is taking longer to find.${previous}`,
    unavailable: `Location unavailable. Check Location Services.${previous}`,
    denied: `Location permission denied. Allow it in your browser settings.${previous}`
  }
  const text = messages[status] ?? 'Finding your location…'
  if (element.textContent !== text) element.textContent = text
}

function updateUserLocation (coords) {
  globalUserCoords = coords
  const today = new Date().toISOString().slice(0, 10)
  // Declination changes slowly; leave the compass filter running as GPS updates.
  if (!declinationCoords || today !== declinationDate || calculateBearingAndDistance(declinationCoords, coords).distance >= 1) {
    globalDeclination = compass.setLocation(coords.lat, coords.lng)
    declinationCoords = coords
    declinationDate = today
    setupAboutPanel()
  }
  const area = document.getElementById('areaSelect')?.value || 'all'
  if (selectedTransmitter) {
    Object.assign(selectedTransmitter, calculateBearingAndDistance(coords, selectedTransmitter))
    const bearing = document.querySelector('[data-site-bearing]')
    const distance = document.querySelector('[data-site-distance]')
    if (bearing) bearing.textContent = `${Math.round(selectedTransmitter.bearing)}°`
    if (distance) distance.innerHTML = `${selectedTransmitter.distance.toFixed(1)} <small>km</small>`
  }
  updateTransmitters(globalTransmitters, coords, area)
  compass.start()
}

// --- Utility Functions ---
function toRadians (degrees) {
  return (degrees * Math.PI) / 180
}
function calculateBearingAndDistance (fromCoords, toCoords) {
  const lat1 = toRadians(fromCoords.lat)
  const lon1 = toRadians(fromCoords.lng)
  const lat2 = toRadians(toCoords.lat)
  const lon2 = toRadians(toCoords.lng)
  const dLat = lat2 - lat1
  const dLon = lon2 - lon1
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const distance = R * c
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  const bearing = (Math.atan2(y, x) * 180) / Math.PI
  return { bearing: (bearing + 360) % 360, distance }
}

// --- Modal/Panel Logic ---

function hideSitePanel () {
  const panel = document.getElementById('siteInfoPanel')
  if (!panel || !selectedTransmitter) return

  selectedTransmitter = null
  panel.classList.remove('active')
  panel.setAttribute('aria-hidden', 'true')
  panel.inert = true
  document.getElementById('siteInfoBackdrop')?.classList.remove('active')

  sitePanelBackground.forEach((wasInert, element) => { element.inert = wasInert })
  sitePanelBackground.clear()
  if (sitePanelTrigger?.isConnected) sitePanelTrigger.focus({ preventScroll: true })
  sitePanelTrigger = null
}

function showSitePanel (tx) {
  const panel = document.getElementById('siteInfoPanel')
  const contentDiv = document.getElementById('siteInfoContent')
  if (!panel || !contentDiv || !globalUserCoords) return

  // Use one selected transmitter and the same heading as the overview arrows.
  selectedTransmitter = { ...tx, ...calculateBearingAndDistance(globalUserCoords, {
    lat: tx.lat,
    lng: tx.lng
  }) }
  if (!sitePanelTrigger) sitePanelTrigger = document.activeElement

  const data = selectedTransmitter
  const elevation = data.elevation_m == null ? '—' : `${data.elevation_m} m`
  const channels = data.frequencies?.length ? data.frequencies.join(', ') : '—'
  const details = [
    ['Location', data.location],
    ['Polarity', data.polarity],
    ['Power', data.power],
    ['Elevation', elevation],
    ['Channels', channels]
  ]

  contentDiv.innerHTML = `
    <button type="button" class="site-sheet-close" aria-label="Close transmitter details">
      <svg viewBox="0 0 64 16" aria-hidden="true" focusable="false">
        <path d="M5 3L32 12L59 3" />
      </svg>
    </button>
    <div class="site-sheet-body">
      <header class="site-heading">
        <h3 id="site-title">${escapeHtml(data.name)}</h3>
        <p>${escapeHtml([data.area, data.service].filter(Boolean).join(' · '))}</p>
      </header>
      <div class="site-aiming">
        <div class="arrow site-pointer" data-selected-pointer aria-hidden="true"></div>
      </div>
      <div class="site-summary">
        <div><strong data-site-bearing>${Math.round(data.bearing)}°</strong><span>True bearing</span></div>
        <div><strong data-site-distance>${data.distance.toFixed(1)} <small>km</small></strong><span>Distance</span></div>
      </div>
      <dl class="site-details">
        ${details.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value ?? '—')}</dd></div>`).join('')}
      </dl>
    </div>`
  contentDiv.querySelector('[data-selected-pointer]').appendChild(createPointerSvg())
  contentDiv.scrollTop = 0
  updateArrowRotations()

  // Keep the covered page out of the keyboard and screen-reader navigation.
  document.querySelectorAll('.header, .container, #sideMenu, #aboutOverlay, #menuBackdrop').forEach(element => {
    if (!sitePanelBackground.has(element)) sitePanelBackground.set(element, element.inert)
    element.inert = true
  })
  panel.inert = false
  panel.setAttribute('aria-hidden', 'false')
  panel.classList.add('active')
  document.getElementById('siteInfoBackdrop')?.classList.add('active')
  contentDiv.querySelector('.site-sheet-close').focus({ preventScroll: true })
}

function escapeHtml (value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character])
}

// Browse the selected transmitter's area, including sites outside the closest four.
function stepTransmitter (direction) {
  if (!selectedTransmitter || !globalUserCoords) return

  const sites = globalTransmitters
    .filter(tx => tx.area === selectedTransmitter.area)
    .map(tx => ({ ...tx, ...calculateBearingAndDistance(globalUserCoords, tx) }))
    .sort((a, b) => a.distance - b.distance)
  const index = sites.findIndex(tx => tx.id === selectedTransmitter.id)
  if (index < 0 || sites.length < 2) return

  const nextIndex = (index + direction + sites.length) % sites.length
  showSitePanel(sites[nextIndex])

  // A small sideways entrance provides feedback without reopening the sheet.
  if (!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
    document.querySelector('.site-sheet-body')?.animate?.([
      { opacity: 0.5, transform: `translateX(${direction * 24}px)` },
      { opacity: 1, transform: 'translateX(0)' }
    ], { duration: 220, easing: 'ease-out' })
  }
}

function setupSitePanel () {
  const panel = document.getElementById('siteInfoPanel')
  if (!panel) return

  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-modal', 'true')
  panel.setAttribute('aria-labelledby', 'site-title')
  panel.setAttribute('aria-hidden', 'true')
  panel.inert = true

  const backdrop = document.createElement('div')
  backdrop.id = 'siteInfoBackdrop'
  backdrop.setAttribute('aria-hidden', 'true')
  backdrop.addEventListener('click', hideSitePanel)
  document.body.appendChild(backdrop)

  // Left/right browses sites; vertical gestures scroll; a tap closes.
  let pointerStart = null
  let moved = false
  panel.addEventListener('pointerdown', event => {
    if (event.isPrimary === false) {
      pointerStart = null
      moved = true
      return
    }
    pointerStart = { x: event.clientX, y: event.clientY }
    moved = false
  })
  panel.addEventListener('pointermove', event => {
    if (pointerStart && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 10) moved = true
  })
  panel.addEventListener('pointercancel', () => { moved = true; pointerStart = null })
  panel.addEventListener('pointerup', event => {
    if (!pointerStart) return
    const dx = event.clientX - pointerStart.x
    const dy = event.clientY - pointerStart.y
    pointerStart = null

    if (Math.hypot(dx, dy) > 10) moved = true
    if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      moved = true
      stepTransmitter(dx < 0 ? 1 : -1)
    }
  })
  panel.addEventListener('click', event => {
    event.stopPropagation()
    if (!moved || event.detail === 0) hideSitePanel()
    moved = false
  })

  document.addEventListener('keydown', event => {
    if (!selectedTransmitter) return
    if (event.key === 'Escape') {
      event.preventDefault()
      hideSitePanel()
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      stepTransmitter(event.key === 'ArrowRight' ? 1 : -1)
    } else if (event.key === 'Tab') {
      // The unlabeled chevron is the sheet's only keyboard control.
      event.preventDefault()
      panel.querySelector('.site-sheet-close')?.focus()
    }
  })
}

// --- Core Logic ---

// Present the current implementation and the next development stage.
function setupAboutPanel () {
  const declination = globalDeclination === null ? 'awaiting location' : `${Math.abs(globalDeclination).toFixed(2)}°${globalDeclination < 0 ? 'W' : 'E'}`

  const content = `
        <h2>📡 Signal Finder PWA</h2>
        <p class="about-tagline">
            A mobile web project for locating and aligning with New Zealand TV transmitters.
        </p>

        <div class="about-section">
            <h4>True-North Navigation</h4>
            <p>
                Calculates <strong>initial true bearings</strong> and great-circle distances between the user's location
                and transmitter coordinates. An offline implementation of <strong>WMM2025</strong> calculates magnetic
                declination from location and date, bringing magnetic compass readings into the same true-north reference.
                Current correction: <strong>${declination}</strong>.
            </p>
            <div class="about-badges">
                <span class="tech-badge">WMM2025</span>
                <span class="tech-badge">True Bearings</span>
                <span class="tech-badge">Haversine Distance</span>
            </div>
        </div>

        <div class="about-section">
            <h4>Compass Processing</h4>
            <p>
                Uses separate sensor paths for <strong>Safari compass readings</strong> and
                <strong>Android Chrome absolute orientation events</strong>. Heading handling accounts for screen rotation
                and handheld tilt, while exponential smoothing reduces jitter. Continuous arrow rotation takes the short
                turn when crossing north.
            </p>
            <div class="about-badges">
                <span class="tech-badge">DeviceOrientation</span>
                <span class="tech-badge">Orientation Geometry</span>
                <span class="tech-badge">Exponential Smoothing</span>
            </div>
        </div>

        <div class="about-section">
            <h4>Live Location</h4>
            <p>
                Requests <strong>high-accuracy location updates</strong>, checks reported accuracy and reading age,
                and filters minor drift and temporarily worse fixes. Bearings and distances refresh as the user moves.
                Tracking pauses in the background and requests a fresh location on return, with accuracy and status
                shown in the menu.
            </p>
            <div class="about-badges">
                <span class="tech-badge">Geolocation API</span>
                <span class="tech-badge">Accuracy Filtering</span>
                <span class="tech-badge">Page Lifecycle</span>
            </div>
        </div>

        <div class="about-section">
            <h4>Modular Mobile Design</h4>
            <p>
                Built with <strong>ES modules</strong> separating the app interface, compass, location tracking,
                menu and screen wake lock. Shared SVG arrows support both the four-site overview and an expanded
                transmitter sheet, with swipe navigation to additional sites. Service-worker caching supports offline
                use after the app files and transmitter data have been cached.
            </p>
            <div class="about-badges">
                <span class="tech-badge">ES Modules</span>
                <span class="tech-badge">SVG</span>
                <span class="tech-badge">Progressive Web App</span>
                <span class="tech-badge">Screen Wake Lock</span>
            </div>
        </div>

        <div class="about-section">
            <h4>Next Stage: Augmented Reality</h4>
            <p>
                A planned camera view will place transmitter directions over the surroundings when the phone is raised.
                The current compass and location modules provide the foundation; <strong>AR is not yet implemented</strong>.
            </p>
        </div>

        <div class="about-actions">
            <button id="about-close-btn">Close</button>
        </div>
    `

  const panel = document.getElementById('aboutPanelContent')
  panel.innerHTML = content

  document
    .getElementById('about-close-btn')
    .addEventListener('click', function () {
      document.getElementById('aboutOverlay').style.display = 'none'
    })
}

// FUNCTION: Updates the transform property for all currently displayed arrows
function rotateArrow (element, angle) {
  const previous = arrowRotations.get(element)
  const rotation = previous === undefined ? angle : previous + ((angle - previous + 180) % 360 + 360) % 360 - 180
  arrowRotations.set(element, rotation)
  element.style.transform = `rotate(${rotation}deg)`
}

function updateArrowRotations () {
  // Rotates North Compass (Re-introduced)
  const north = document.getElementById('north')
  if (north) {
    rotateArrow(north, -currentTrueRotation)
  }

  transmittersToDisplay.forEach(tx => {
    const arrow = document.getElementById(tx.id)
    if (arrow) {
      const arrowRotation = 360 + (tx.bearing - currentTrueRotation)
      rotateArrow(arrow, arrowRotation)

      const infoDiv = document.getElementById(`${tx.id}-info`)
      if (infoDiv) {
        infoDiv.innerHTML = formatTransmitterInfo(tx)
      }
    }
  })

  if (selectedTransmitter) {
    const pointer = document.querySelector('#siteInfoPanel [data-selected-pointer]')
    if (pointer) rotateArrow(pointer, 360 + selectedTransmitter.bearing - currentTrueRotation)
  }
}

// A single reusable SVG keeps transmitter and north pointers consistent.
function createPointerSvg () {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 64 64')
  svg.setAttribute('class', 'pointer-svg')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  // Echo the app icon: a fine shaft, swept point and restrained fletching.
  path.setAttribute('d', 'M32 5L37 23L32.75 20V48H31.25V20L27 23Z M31.25 48L28 52V58L31.25 54.5Z M32.75 48L36 52V58L32.75 54.5Z')
  path.setAttribute('fill', 'currentColor')
  svg.appendChild(path)
  return svg
}

function setupNorthPointer () {
  const north = document.getElementById('north')
  if (!north) return

  north.replaceChildren(createPointerSvg())
  north.setAttribute('aria-hidden', 'true')

  // Keep the N label stationary while the pointer rotates.
  const container = north.parentElement
  if (container && !container.querySelector('.north-label')) {
    const label = document.createElement('span')
    label.className = 'north-label'
    label.textContent = 'N'
    container.appendChild(label)
  }
}

async function activateOrientation () {
  if (activationStarted) return
  activationStarted = true
  try {
    const response = await fetch('transmitters.json')
    if (!response.ok) throw new Error(`Transmitter request failed: ${response.status}`)
    globalTransmitters = await response.json()
    populateAreaSelect(globalTransmitters)
  } catch (error) {
    activationStarted = false
    if (DEBUG) console.error('Failed to load transmitter data:', error)
    alert(
      'Could not load transmitter data. Please check your network or JSON file path.'
    )
    return
  }

  setupAboutPanel()
  locationTracker.start()
}

function updateTransmitters (allTransmitters, userCoords, filterArea) {
  let filteredTransmitters = allTransmitters

  if (filterArea !== 'all') {
    filteredTransmitters = allTransmitters.filter(tx => tx.area === filterArea)
    // Auckland's overview uses its four main sites; swiping includes every site.
    if (filterArea === 'Auckland') {
      const mainSites = ['skytower', 'remuera', 'pinehill', 'waiatarua']
      filteredTransmitters = filteredTransmitters.filter(tx => mainSites.includes(tx.id))
    }
  }

  const processedTransmitters = filteredTransmitters
    .map(tx => ({
      ...tx,
      ...calculateBearingAndDistance(userCoords, {
        lat: tx.lat,
        lng: tx.lng
      })
    }))
    .sort((a, b) => a.distance - b.distance)

  const next = processedTransmitters.slice(0, MAX_DISPLAY_SITES)
  const sameSites = next.length === transmittersToDisplay.length && next.every((tx, index) => tx.id === transmittersToDisplay[index].id)
  transmittersToDisplay = next
  if (!sameSites) renderTransmitters(transmittersToDisplay)

  updateArrowRotations()
}

function formatTransmitterInfo (tx) {
  return `<div>${Math.round(tx.bearing)}° T</div><span class="info-separator" aria-hidden="true">·</span><div>${tx.distance.toFixed(1)} km</div>`
}

function buildTransmitterArrow (tx) {
  const arrowContainer = document.createElement('div')
  arrowContainer.className = 'arrow-container'
  arrowContainer.setAttribute('role', 'button')
  arrowContainer.setAttribute('tabindex', '0')
  arrowContainer.setAttribute('data-transmitter', tx.id)
  arrowContainer.setAttribute('aria-label', `View ${tx.name} transmitter details`)
  arrowContainer.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      showSitePanel(tx)
    }
  })

  const arrowDiv = document.createElement('div')
  arrowDiv.className = 'arrow'
  arrowDiv.id = tx.id
  arrowDiv.setAttribute('aria-hidden', 'true')
  arrowDiv.appendChild(createPointerSvg())

  // Click/Tap listener (Mobile and Desktop Click)
  arrowContainer.addEventListener('click', e => {
    e.preventDefault()
    e.stopPropagation()
    showSitePanel(tx)
  })

  const infoDiv = document.createElement('div')
  infoDiv.className = 'info'
  infoDiv.id = `${tx.id}-info`
  infoDiv.innerHTML = formatTransmitterInfo(tx)

  const nameDiv = document.createElement('div')
  nameDiv.className = 'arrow-name'
  nameDiv.textContent = tx.name

  arrowContainer.appendChild(arrowDiv)
  arrowContainer.appendChild(nameDiv)
  arrowContainer.appendChild(infoDiv)

  return arrowContainer
}

// Function to create and inject the HTML for the displayed transmitters
function renderTransmitters (transmitters) {
  const topContainer = document.getElementById('topArrows')
  const bottomContainer = document.getElementById('bottomArrows')
  const focusedId = document.activeElement?.getAttribute('data-transmitter')
  const triggerId = sitePanelTrigger?.getAttribute('data-transmitter')

  topContainer.innerHTML = ''
  bottomContainer.innerHTML = ''

  const splitIndex = Math.ceil(transmitters.length / 2)

  const firstHalf = transmitters.slice(0, splitIndex)
  const secondHalf = transmitters.slice(splitIndex)

  // Render the top half
  firstHalf.forEach(tx => {
    topContainer.appendChild(buildTransmitterArrow(tx))
  })

  // Render the bottom half
  secondHalf.forEach(tx => {
    bottomContainer.appendChild(buildTransmitterArrow(tx))
  })
  if (triggerId) sitePanelTrigger = document.getElementById(triggerId)?.parentElement ?? document.getElementById('menuButton')
  if (focusedId) (document.getElementById(focusedId)?.parentElement ?? document.getElementById('menuButton'))?.focus({ preventScroll: true })
}

function populateAreaSelect (transmitters) {
  const select = document.getElementById('areaSelect')
  const uniqueAreas = [...new Set(transmitters.map(tx => tx.area))].sort()

  while (select.options.length > 1) {
    select.remove(1)
  }

  uniqueAreas.forEach(area => {
    const option = document.createElement('option')
    option.value = area
    option.textContent = area
    select.appendChild(option)
  })
}

// --- Initialisation/Error Handling (Wrap in DOMContentLoaded) ---

document.addEventListener('DOMContentLoaded', () => {
  setupNorthPointer()
  setupSitePanel()
  setupMenu()
  setupLocationStatus()

  // 1. Attach listeners that require DOM elements to exist




  // About Link (Listener for internal button is in setupAboutPanel)
  document.getElementById('aboutLink').addEventListener('click', function (e) {
    e.preventDefault()
    document.getElementById('aboutOverlay').style.display = 'flex'
    toggleSideMenu()
  })

  // Dropdown Filter
  document
    .getElementById('areaSelect')
    .addEventListener('change', function (e) {
      if (globalTransmitters.length > 0 && globalUserCoords !== null) {
        updateTransmitters(globalTransmitters, globalUserCoords, e.target.value)
      } else {
        alert(
          'Please wait for your GPS location to be determined before filtering.'
        )
      }
      
      // CHANGE: Just call the toggle. Since it's open, this will close it.
      toggleSideMenu() 
    })

  // 2. Start core PWA/Location process after DOM is ready
  // 1. Splash Screen / Permission Request
  const permBtn = document.getElementById('requestPermission');
  if (permBtn) {
      permBtn.addEventListener('click', async function () {
          // ... existing logic ...
          try {
            const permissionState = await compass.requestPermission()
            if (permissionState === 'granted') {
              activateOrientation()
              document.querySelector('.splash-screen').style.display = 'none'
            } else {
              alert('Permission not granted for motion sensors.')
            }
          } catch (error) {
           if (DEBUG)  console.error(error)
            // Just activate anyway for desktop dev testing
            activateOrientation()
            document.querySelector('.splash-screen').style.display = 'none'
          }
      });
  } else {
      if (DEBUG) console.error("Critical: 'requestPermission' button not found.");
  }

  // 3. Service Worker (PWA setup)
  window.addEventListener('load', function () {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('service-worker.js')
        .then(function (registration) {
          if (DEBUG) console.log(
            'ServiceWorker registration successful with scope: ',
            registration.scope
          )
        })
        .catch(function (err) {
          if (DEBUG) console.log('ServiceWorker registration failed: ', err)
        })
    }
  })
}) // END DOMContentLoaded
