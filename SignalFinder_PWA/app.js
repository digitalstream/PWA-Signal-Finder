// --- Constants & Global State ---
// NOTE: EAST_DECLINATION is now replaced by globalDeclination,
// which is set dynamically based on an internal calculation.
const DEBUG = false;
const R = 6371 // Earth's radius in kilometers
const ALPHA = 0.15 // Smoothing factor
const MAX_DISPLAY_SITES = 4 // Display 4 sites (2 on top, 2 on bottom)

// UPDATED GLOBAL VAR: This will be set by the internal function
let globalDeclination = 20.3 // Default fallback value for Auckland, NZ

// GLOBAL VARIABLES
let globalTransmitters = []
let globalUserCoords = null
let transmittersToDisplay = []
let currentTrueRotation = 0
let lastTrueRotation = 0

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

// --- New Function: Get Magnetic Declination (Self-Contained Logic) ---
function getApproximateDeclination (lat, lng) {
  // This is a simplified model based on known WMM patterns for NZ's high positive declination (East).

  let declination = 20.3 // Base value for Auckland

  // Adjustment for Latitude (South = Higher Declination in NZ)
  // NZ Latitudes: -34 (North) to -47 (South)
  const latAdjustment = (Math.abs(lat) - 37.0) * 0.4
  declination += latAdjustment

  // Adjustment for Longitude (West = Higher Declination in NZ)
  // NZ Longitudes: 170 (West) to 178 (East)
  const lngAdjustment = (174.5 - lng) * 0.4
  declination += lngAdjustment

  // Clamp the value to a realistic NZ range (e.g., 18 to 28 degrees East)
  const finalDeclination = Math.min(Math.max(declination, 18.0), 28.0)

  return finalDeclination
}

// --- Modal/Panel Logic ---

function hideSitePanel () {
  document.getElementById('siteInfoPanel').classList.remove('active')
}

function showSitePanel (tx) {
  const panel = document.getElementById('siteInfoPanel')
  const contentDiv = document.getElementById('siteInfoContent')

  // Recalculate distance for fresh data
  const currentBearingDistance = calculateBearingAndDistance(globalUserCoords, {
    lat: tx.lat,
    lng: tx.lng
  })

  // Generate the HTML content
  const content = `
                <h3 style="margin-top: 0; margin-bottom: 10px; text-align: center;">${tx.name} Transmitter</h3>
                <div id="modal-polarity">${tx.polarity ? tx.polarity.toUpperCase().charAt(0) : 'N/A'}</div>
                
                <div id="site-info-grid">
                    <div class="info-label">Location:</div><div class="info-data">${tx.location} (${tx.area})</div>
                    <div class="info-label">Elevation:</div><div class="info-data">${tx.elevation_m} m</div>
                    <div class="info-label">Power:</div><div class="info-data">${tx.power}</div>
                    <div class="info-label">Service:</div><div class="info-data">${tx.service}</div>
                    <div class="info-label">Channels:</div><div class="info-data">${tx.frequencies ? tx.frequencies.join(', ') : 'N/A'}</div>
                    <div class="info-label">Distance:</div><div class="info-data">${currentBearingDistance.distance.toFixed(1)} km</div>
                    <div class="info-label">Bearing:</div><div class="info-data">${Math.round(currentBearingDistance.bearing)}° True</div>
                </div>
                <button id="modal-close-btn">Close Details</button>
            `

  contentDiv.innerHTML = content

  // --- CRITICAL FIX: Removed listener for 'panel-close-btn' because it is gone ---

  // Attach listener ONLY to the new button inside the content
  const closeBtn = document.getElementById('modal-close-btn');
  if (closeBtn) {
      closeBtn.addEventListener('click', hideSitePanel);
  }

  // Show the panel
  panel.classList.add('active')
}

// --- Core Logic ---

// Helper function to handle menu state (UPDATED FOR FULL WIDTH)
function toggleSideMenu() {
  const menu = document.getElementById('sideMenu');
  const backdrop = document.getElementById('menuBackdrop');
  
  // Check the current CSS state
  const isOpen = menu.style.left === '0px';

  if (isOpen) {
    // It is open, so CLOSE it
    menu.style.left = '-100vw';
    if(backdrop) backdrop.style.display = 'none';
  } else {
    // It is closed, so OPEN it
    menu.style.left = '0px';
    if(backdrop) backdrop.style.display = 'block';
  }
}

// FUNCTION: Sets up and displays the custom About panel (MERGED & STYLED)
function setupAboutPanel () {
  const declination = globalDeclination.toFixed(2)

   const content = `
        <h2 style="text-align: center; margin-bottom: 5px;">📡 Signal Finder PWA</h2>
        <p style="text-align: center; font-size: 0.9rem; color: #aaa; margin-bottom: 20px;">
            Geo-Spatial Augmented Reality Tool
        </p>
        
        <div style="text-align: left; margin-bottom: 20px;">
            <h4 style="border-bottom: 1px solid #00ffcc; padding-bottom: 5px; color: #00ffcc; text-transform: uppercase; font-size: 0.9rem;">Core Architecture</h4>
            <p style="font-size: 0.9rem; line-height: 1.5; color: #ddd;">
                A client-side PWA leveraging <strong>Sensor Fusion</strong> to provide real-time antenna alignment data. 
                It calculates bearings using the <strong>Haversine Formula</strong> and dynamically compensates for 
                Magnetic Declination (${declination}°E) using a custom geospatial model based on the user's GPS coordinates.
            </p>
            <div style="margin-top: 5px;">
                <span class="tech-badge">Geo-Computation</span>
                <span class="tech-badge">Sensor Fusion</span>
                <span class="tech-badge">DeviceOrientation API</span>
                <span class="tech-badge">EWMA Smoothing</span>
            </div>
        </div>

        <div style="text-align: left; margin-bottom: 20px;">
            <h4 style="border-bottom: 1px solid #00ffcc; padding-bottom: 5px; color: #00ffcc; text-transform: uppercase; font-size: 0.9rem;">Advanced Engineering</h4>
            <p style="font-size: 0.9rem; line-height: 1.5; color: #ddd;">
                Solved critical mobile browser constraints including <strong>Touch Event Race Conditions</strong> on iOS 
                and non-standard compass calibration on Android. Implemented an <strong>Exponential Weighted Moving Average (EWMA)</strong> 
                filter to stabilize needle jitter for a smooth HUD experience.
            </p>
            <div style="margin-top: 5px;">
                <span class="tech-badge">PWA Service Worker</span>
                <span class="tech-badge">Event Loop Optimization</span>
                <span class="tech-badge">Cross-Platform UX</span>
            </div>
        </div>

        <div style="text-align: center; margin-top: 20px;">
            <button id="about-close-btn" style="padding: 10px 30px; cursor: pointer; background: rgba(0, 255, 204, 0.2); border: 1px solid #00ffcc; color: #00ffcc; border-radius: 20px; font-weight: bold;">Close System View</button>
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
function updateArrowRotations () {
  // Rotates North Compass (Re-introduced)
  const north = document.getElementById('north')
  if (north) {
    north.style.transform = `rotate(${-currentTrueRotation}deg)`
  }

  transmittersToDisplay.forEach(tx => {
    const arrow = document.getElementById(tx.id)
    if (arrow) {
      const arrowRotation = 360 + (tx.bearing - currentTrueRotation)
      arrow.style.transform = `rotate(${arrowRotation}deg)`

      const infoDiv = document.getElementById(`${tx.id}-info`)
      if (infoDiv) {
        infoDiv.innerHTML = `<div>Bearing: ${Math.round(
          tx.bearing
        )}°</div><div>Dist: ${tx.distance.toFixed(1)} km</div>`
      }
    }
  })
}

async function activateOrientation () {
  try {
    const response = await fetch('transmitters.json')
    globalTransmitters = await response.json()
    populateAreaSelect(globalTransmitters)
  } catch (error) {
    if (DEBUG) console.error('Failed to load transmitter data:', error)
    alert(
      'Could not load transmitter data. Please check your network or JSON file path.'
    )
    return
  }

  navigator.geolocation.getCurrentPosition(
    async function (position) {
      // Set global coords
      const userCoords = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      }
      globalUserCoords = userCoords

      // 1. GET DYNAMIC DECLINATION
      globalDeclination = getApproximateDeclination(
        userCoords.lat,
        userCoords.lng
      )

      updateTransmitters(globalTransmitters, globalUserCoords, 'all')

      window.addEventListener(
        'deviceorientation',
        function (event) {
          const rotation = event.webkitCompassHeading || event.alpha || 0

          // UPDATED: Use the globalDeclination value
          let rawTrueRotation = rotation + globalDeclination
          let normalizedTrueRotation = rawTrueRotation % 360

          let delta = normalizedTrueRotation - lastTrueRotation

          if (delta > 180) {
            delta -= 360
          } else if (delta < -180) {
            delta += 360
          }

          currentTrueRotation = lastTrueRotation + delta * ALPHA
          currentTrueRotation = currentTrueRotation % 360
          lastTrueRotation = currentTrueRotation

          updateArrowRotations()
        },
        true
      )
    },
    function (error) {
      if (DEBUG) console.error('Geolocation Error:', error)
      alert('Geolocation is required to find your position.')
    }
  )

  setupAboutPanel()
}

function updateTransmitters (allTransmitters, userCoords, filterArea) {
  let filteredTransmitters = allTransmitters

  if (filterArea !== 'all') {
    filteredTransmitters = allTransmitters.filter(tx => tx.area === filterArea)
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

  transmittersToDisplay = processedTransmitters.slice(0, MAX_DISPLAY_SITES)

  renderTransmitters(transmittersToDisplay)

  if (currentTrueRotation !== 0) {
    updateArrowRotations()
  }
}

function buildTransmitterArrow (tx) {
  const arrowContainer = document.createElement('div')
  arrowContainer.className = 'arrow-container'

  const arrowDiv = document.createElement('div')
  arrowDiv.className = 'arrow'
  arrowDiv.id = tx.id

  // MouseEnter for hover functionality (Desktop)
  arrowContainer.addEventListener('mouseenter', () => {
    if (window.innerWidth > 768) {
      showSitePanel(tx)
    }
  })

  // Click/Tap listener (Mobile and Desktop Click)
  arrowContainer.addEventListener('click', e => {
    e.preventDefault()
    e.stopPropagation()
    showSitePanel(tx)
  })

  // MouseLeave listener for desktop hover
  arrowContainer.addEventListener('mouseleave', () => {
    if (window.innerWidth > 768) {
      hideSitePanel()
    }
  })

  const infoDiv = document.createElement('div')
  infoDiv.className = 'info'
  infoDiv.id = `${tx.id}-info`
  infoDiv.innerHTML = `<div>Bearing: ${Math.round(
    tx.bearing
  )}°</div><div>Dist: ${tx.distance.toFixed(1)} km</div>`

  const nameDiv = document.createElement('div')
  nameDiv.className = 'arrow-name'
  nameDiv.textContent = tx.name

  arrowContainer.appendChild(arrowDiv)
  arrowContainer.appendChild(infoDiv)
  arrowContainer.appendChild(nameDiv)

  return arrowContainer
}

// Function to create and inject the HTML for the displayed transmitters
function renderTransmitters (transmitters) {
  const topContainer = document.getElementById('topArrows')
  const bottomContainer = document.getElementById('bottomArrows')

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
  // 1. Attach listeners that require DOM elements to exist



  // Site Info Panel Close on Outside Click/Tap
  const siteInfoPanel = document.getElementById('siteInfoPanel');
  if (siteInfoPanel) {
      siteInfoPanel.addEventListener('click', function (e) {
          if (e.target === this) {
              hideSitePanel();
          }
      });
  }


   document.getElementById('menuButton').addEventListener('click', toggleSideMenu);

// Close when clicking the dark background
  document
    .getElementById('menuBackdrop')
    .addEventListener('click', toggleSideMenu)

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

  // MouseLeave listeners
  document
    .getElementById('topArrows')
    .addEventListener('mouseleave', hideSitePanel)
  document
    .getElementById('bottomArrows')
    .addEventListener('mouseleave', hideSitePanel)

  // 2. Start core PWA/Location process after DOM is ready
  // 1. Splash Screen / Permission Request
  const permBtn = document.getElementById('requestPermission');
  if (permBtn) {
      permBtn.addEventListener('click', async function () {
          // ... existing logic ...
          try {
            if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
              const permissionState = await DeviceOrientationEvent.requestPermission()
              if (permissionState === 'granted') {
                activateOrientation()
                document.querySelector('.splash-screen').style.display = 'none'
              } else {
                alert('Permission not granted for motion sensors.')
              }
            } else {
              // Non-iOS or Desktop (Chrome)
              activateOrientation()
              document.querySelector('.splash-screen').style.display = 'none'
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
