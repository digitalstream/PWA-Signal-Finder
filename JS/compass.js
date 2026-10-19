const DEG = Math.PI / 180
const wrap = angle => ((angle % 360) + 360) % 360
const matrix = () => Array.from({ length: 13 }, () => new Float64Array(13))

const SMOOTHING_MS = 100
const MIN_PROJECTION = 0.15

function screenAngle () {
  return wrap(window.screen?.orientation?.angle ?? window.orientation ?? 0)
}

function projectHeading (alpha, beta, gamma, angle = 0) {
  const a = alpha * DEG
  const b = beta * DEG
  const g = gamma * DEG
  const s = angle * DEG
  const ca = Math.cos(a), sa = Math.sin(a)
  const cb = Math.cos(b), sb = Math.sin(b)
  const cg = Math.cos(g), sg = Math.sin(g)
  const x = Math.sin(s), y = Math.cos(s)
  const east = (ca * cg - sa * sb * sg) * x - sa * cb * y
  const north = (sa * cg + ca * sb * sg) * x + ca * cb * y
  if (Math.hypot(east, north) < MIN_PROJECTION) return null
  return wrap(Math.atan2(east, north) / DEG)
}

export class Compass {
  constructor ({ onReading = () => {}, onStatus = () => {} } = {}) {
    this.onReading = onReading
    this.onStatus = onStatus
    this.declination = null
    this.rotation = null
    this.started = false
    this.permission = 'prompt'
    this.lastSample = null
    this.lastSource = null
    this.lastSourceTime = 0
    this.lastFilterTime = null
    this.handleOrientation = this.handleOrientation.bind(this)
    this.handleScreenChange = this.handleScreenChange.bind(this)
    this.handleVisibility = this.handleVisibility.bind(this)
  }

  // Request sensor access directly from the permission-button tap.
  async requestPermission () {
    const api = window.DeviceOrientationEvent
    if (!api) return (this.permission = 'unavailable')
    if (typeof api.requestPermission !== 'function') return (this.permission = 'granted')
    try { return (this.permission = await api.requestPermission(true)) }
    catch (error) { this.permission = 'denied'; throw error }
  }

  setLocation (lat, lng, altitudeMeters = 0, date = new Date()) {
    this.declination = calculateDeclination(lat, lng, date, altitudeMeters / 1000)
    return this.declination
  }

  start () {
    if (this.started || this.permission === 'denied' || this.permission === 'unavailable') return
    this.started = true
    window.addEventListener('deviceorientation', this.handleOrientation, true)
    window.addEventListener('deviceorientationabsolute', this.handleOrientation, true)
    window.addEventListener('orientationchange', this.handleScreenChange)
    window.screen?.orientation?.addEventListener?.('change', this.handleScreenChange)
    document.addEventListener('visibilitychange', this.handleVisibility)
    this.onStatus({ status: 'waiting' })
  }

  stop () {
    if (!this.started) return
    this.started = false
    window.removeEventListener('deviceorientation', this.handleOrientation, true)
    window.removeEventListener('deviceorientationabsolute', this.handleOrientation, true)
    window.removeEventListener('orientationchange', this.handleScreenChange)
    window.screen?.orientation?.removeEventListener?.('change', this.handleScreenChange)
    document.removeEventListener('visibilitychange', this.handleVisibility)
    this.reset()
  }

  reset () {
    this.rotation = null
    this.lastFilterTime = null
    this.lastSample = null
    this.lastSource = null
    this.lastSourceTime = 0
  }

  handleVisibility () {
    this.reset()
  }

  handleScreenChange () {
    const sample = this.lastSample
    this.rotation = null
    this.lastFilterTime = null
    if (sample && Date.now() - this.lastSourceTime < 1500) this.handleOrientation(sample)
  }

  handleOrientation (event) {
    if (!this.started || document.visibilityState === 'hidden') return
    const angle = screenAngle()
    const alpha = event.alpha
    const beta = event.beta
    const gamma = event.gamma
    const hasAngles = [alpha, beta, gamma].every(Number.isFinite)
    const accuracy = Number.isFinite(event.webkitCompassAccuracy) ? event.webkitCompassAccuracy : null
    let magneticHeading
    let source

    // Safari supplies a magnetic heading; Chrome needs absolute Euler angles.
    if (Number.isFinite(event.webkitCompassHeading)) {
      if (event.webkitCompassHeading < 0 || accuracy < 0) {
        this.onStatus({ status: 'uncalibrated' })
        return
      }
      magneticHeading = event.webkitCompassHeading
      if (angle !== 0) {
        if (!hasAngles) { this.onStatus({ status: 'orientation-unavailable' }); return }
        const natural = projectHeading(0, beta, gamma, 0)
        const screen = projectHeading(0, beta, gamma, angle)
        if (natural === null || screen === null) { this.onStatus({ status: 'tilt-limited' }); return }
        magneticHeading += screen - natural
      }
      source = 'safari'
    } else if ((event.type === 'deviceorientationabsolute' || event.absolute === true) && hasAngles) {
      magneticHeading = projectHeading(alpha, beta, gamma, angle)
      if (magneticHeading === null) { this.onStatus({ status: 'tilt-limited' }); return }
      source = 'absolute'
    } else {
      if (!this.lastSource) this.onStatus({ status: 'absolute-heading-unavailable' })
      return
    }

    if (!Number.isFinite(this.declination)) { this.onStatus({ status: 'location-required' }); return }
    const now = Date.now()
    if (source !== 'safari' && this.lastSource === 'safari' && now - this.lastSourceTime < 1500) return
    if (source !== this.lastSource) this.rotation = null
    this.lastSource = source
    this.lastSourceTime = now
    this.lastSample = {
      type: event.type, absolute: event.absolute, alpha, beta, gamma,
      webkitCompassHeading: event.webkitCompassHeading,
      webkitCompassAccuracy: event.webkitCompassAccuracy
    }

    // Apply east-positive declination once, then smooth by the shortest turn.
    const trueHeading = wrap(magneticHeading + this.declination)
    if (this.rotation === null) this.rotation = trueHeading
    else {
      const elapsed = Math.max(1, Math.min(250, now - this.lastFilterTime))
      const weight = 1 - Math.exp(-elapsed / SMOOTHING_MS)
      this.rotation += (wrap(trueHeading - wrap(this.rotation) + 180) - 180) * weight
    }
    this.lastFilterTime = now
    this.onStatus({ status: 'ready', source, compassAccuracy: accuracy })

    // Keep CSS rotation continuous; provide the wrapped angle separately.
    this.onReading({
      heading: this.rotation,
      normalizedHeading: wrap(this.rotation),
      magneticHeading: wrap(magneticHeading),
      declination: this.declination,
      source,
      compassAccuracy: accuracy,
      orientation: { alpha: alpha ?? null, beta: beta ?? null, gamma: gamma ?? null,
        absolute: source === 'absolute', screenAngle: angle }
    })
  }
}

// NOAA/BGS WMM2025 coefficients (public-domain data), valid 2025–2030.
const COEFFICIENTS = `
1 0 -29351.8 0 12 0
1 1 -1410.8 4545.4 9.7 -21.5
2 0 -2556.6 0 -11.6 0
2 1 2951.1 -3133.6 -5.2 -27.7
2 2 1649.3 -815.1 -8 -12.1
3 0 1361 0 -1.3 0
3 1 -2404.1 -56.6 -4.2 4
3 2 1243.8 237.5 .4 -.3
3 3 453.6 -549.5 -15.6 -4.1
4 0 895 0 -1.6 0
4 1 799.5 278.6 -2.4 -1.1
4 2 55.7 -133.9 -6 4.1
4 3 -281.1 212 5.6 1.6
4 4 12.1 -375.6 -7 -4.4
5 0 -233.2 0 .6 0
5 1 368.9 45.4 1.4 -.5
5 2 187.2 220.2 0 2.2
5 3 -138.7 -122.9 .6 .4
5 4 -142 43 2.2 1.7
5 5 20.9 106.1 .9 1.9
6 0 64.4 0 -.2 0
6 1 63.8 -18.4 -.4 .3
6 2 76.9 16.8 .9 -1.6
6 3 -115.7 48.8 1.2 -.4
6 4 -40.9 -59.8 -.9 .9
6 5 14.9 10.9 .3 .7
6 6 -60.7 72.7 .9 .9
7 0 79.5 0 0 0
7 1 -77 -48.9 -.1 .6
7 2 -8.8 -14.4 -.1 .5
7 3 59.3 -1 .5 -.8
7 4 15.8 23.4 -.1 0
7 5 2.5 -7.4 -.8 -1
7 6 -11.1 -25.1 -.8 .6
7 7 14.2 -2.3 .8 -.2
8 0 23.2 0 -.1 0
8 1 10.8 7.1 .2 -.2
8 2 -17.5 -12.6 0 .5
8 3 2 11.4 .5 -.4
8 4 -21.7 -9.7 -.1 .4
8 5 16.9 12.7 .3 -.5
8 6 15 .7 .2 -.6
8 7 -16.8 -5.2 0 .3
8 8 .9 3.9 .2 .2
9 0 4.6 0 0 0
9 1 7.8 -24.8 -.1 -.3
9 2 3 12.2 .1 .3
9 3 -.2 8.3 .3 -.3
9 4 -2.5 -3.3 -.3 .3
9 5 -13.1 -5.2 0 .2
9 6 2.4 7.2 .3 -.1
9 7 8.6 -.6 -.1 -.2
9 8 -8.7 .8 .1 .4
9 9 -12.9 10 -.1 .1
10 0 -1.3 0 .1 0
10 1 -6.4 3.3 0 0
10 2 .2 0 .1 0
10 3 2 2.4 .1 -.2
10 4 -1 5.3 0 .1
10 5 -.6 -9.1 -.3 -.1
10 6 -.9 .4 0 .1
10 7 1.5 -4.2 -.1 0
10 8 .9 -3.8 -.1 -.1
10 9 -2.7 .9 0 .2
10 10 -3.9 -9.1 0 0
11 0 2.9 0 0 0
11 1 -1.5 0 0 0
11 2 -2.5 2.9 0 .1
11 3 2.4 -.6 0 0
11 4 -.6 .2 0 .1
11 5 -.1 .5 -.1 0
11 6 -.6 -.3 0 0
11 7 -.1 -1.2 0 .1
11 8 1.1 -1.7 -.1 0
11 9 -1 -2.9 -.1 0
11 10 -.2 -1.8 -.1 0
11 11 2.6 -2.3 -.1 0
12 0 -2 0 0 0
12 1 -.2 -1.3 0 0
12 2 .3 .7 0 0
12 3 1.2 1 0 -.1
12 4 -1.3 -1.4 0 .1
12 5 .6 0 0 0
12 6 .6 .6 .1 0
12 7 .5 -.1 0 0
12 8 -.1 .8 0 0
12 9 -.4 .1 0 0
12 10 -.2 -1 -.1 0
12 11 -1.3 .1 0 0
12 12 -.7 .2 -.1 -.1
`.trim().split('\n').map(row => row.split(/\s+/).map(Number))

const scales = matrix()
scales[0][0] = 1
for (let n = 1; n <= 12; n++) {
  scales[0][n] = scales[0][n - 1] * (2 * n - 1) / n
  for (let m = 1; m <= n; m++) {
    scales[m][n] = scales[m - 1][n] * Math.sqrt((n - m + 1) * (m === 1 ? 2 : 1) / (n + m))
  }
}

export function calculateDeclination (latitude, longitude, date = new Date(), altitudeKm = 0) {
  const year = date.getUTCFullYear()
  const start = Date.UTC(year, 0, 1)
  const decimalYear = year + (date.getTime() - start) / (Date.UTC(year + 1, 0, 1) - start)
  if (![latitude, longitude, altitudeKm, decimalYear].every(Number.isFinite) ||
      Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new RangeError('Invalid magnetic-model position')
  if (decimalYear < 2025 || decimalYear >= 2030) throw new RangeError('WMM2025 requires a date from 2025 through 2029')

  // Convert WGS84 latitude/height to the model's spherical coordinates.
  const a2 = 6378.137 ** 2
  const b2 = 6356.7523142 ** 2
  const sinLat = Math.sin(latitude * DEG)
  const cosLat = Math.cos(latitude * DEG)
  const q = Math.sqrt(a2 - (a2 - b2) * sinLat ** 2)
  const ratio = ((altitudeKm * q + a2) / (altitudeKm * q + b2)) ** 2
  const ct = sinLat / Math.sqrt(ratio * cosLat ** 2 + sinLat ** 2)
  const st = Math.sqrt(Math.max(0, 1 - ct ** 2))
  const r = Math.sqrt(altitudeKm ** 2 + 2 * altitudeKm * q +
    (a2 ** 2 - (a2 ** 2 - b2 ** 2) * sinLat ** 2) / q ** 2)
  const d = Math.sqrt(a2 * cosLat ** 2 + b2 * sinLat ** 2)
  const ca = (altitudeKm + d) / r
  const sa = (a2 - b2) * cosLat * sinLat / (r * d)
  const p = matrix()
  const dp = matrix()
  const pole = new Float64Array(13)
  p[0][0] = pole[0] = 1
  let radial = 0
  let polar = 0
  let azimuth = 0
  let poleAzimuth = 0

  // Sum the date-adjusted spherical harmonics, then rotate back to WGS84.
  for (const [n, m, g, h, dg, dh] of COEFFICIENTS) {
    const k = ((n - 1) ** 2 - m ** 2) / ((2 * n - 1) * (2 * n - 3))
    if (n === m) {
      p[m][n] = st * p[m - 1][n - 1]
      dp[m][n] = st * dp[m - 1][n - 1] + ct * p[m - 1][n - 1]
    } else {
      const previous = n > 1 ? p[m][n - 2] : 0
      const derivative = n > 1 ? dp[m][n - 2] : 0
      p[m][n] = ct * p[m][n - 1] - k * previous
      dp[m][n] = ct * dp[m][n - 1] - st * p[m][n - 1] - k * derivative
    }
    const scale = scales[m][n] * (6371.2 / r) ** (n + 2)
    const phase = m * longitude * DEG
    const gn = g + (decimalYear - 2025) * dg
    const hn = h + (decimalYear - 2025) * dh
    const along = gn * Math.cos(phase) + hn * Math.sin(phase)
    const across = gn * Math.sin(phase) - hn * Math.cos(phase)
    radial += (n + 1) * along * scale * p[m][n]
    polar -= along * scale * dp[m][n]
    azimuth += m * across * scale * p[m][n]
    if (st === 0 && m === 1) {
      pole[n] = n === 1 ? 1 : ct * pole[n - 1] - k * pole[n - 2]
      poleAzimuth += across * scale * pole[n]
    }
  }
  const north = -polar * ca - radial * sa
  const east = st === 0 ? poleAzimuth : azimuth / st
  return Math.atan2(east, north) / DEG
}
