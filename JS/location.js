const MAX_FIX_AGE_MS = 15000
const STALE_MS = 30000
const OPTIONS = { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }

function separation (a, b) {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 12742000 * Math.asin(Math.sqrt(Math.min(1, h)))
}

export class LocationTracker {
  constructor ({ onLocation = () => {}, onStatus = () => {} } = {}) {
    this.onLocation = onLocation
    this.onStatus = onStatus
    this.started = false
    this.suspended = false
    this.watchId = null
    this.timer = null
    this.generation = 0
    this.position = null
    this.lastFix = null
    this.handleVisibility = this.handleVisibility.bind(this)
    this.handlePageHide = this.handlePageHide.bind(this)
    this.handlePageShow = this.handlePageShow.bind(this)
  }

  start () {
    if (this.started) return
    this.started = true
    document.addEventListener('visibilitychange', this.handleVisibility)
    window.addEventListener('pagehide', this.handlePageHide)
    window.addEventListener('pageshow', this.handlePageShow)
    this.beginWatch()
  }

  stop () {
    this.started = false
    this.endWatch()
    document.removeEventListener('visibilitychange', this.handleVisibility)
    window.removeEventListener('pagehide', this.handlePageHide)
    window.removeEventListener('pageshow', this.handlePageShow)
  }

  report (status, accuracy = this.position?.accuracy ?? null) {
    this.onStatus({ status, accuracy, hasLocation: this.position !== null })
  }

  // Suspend GPS in the background and request a fresh fix on return.
  handleVisibility () {
    if (document.visibilityState === 'hidden') { this.endWatch(); this.report('paused') }
    else this.beginWatch()
  }

  handlePageHide () {
    this.suspended = true
    this.endWatch()
    this.report('paused')
  }

  handlePageShow () {
    this.suspended = false
    this.beginWatch()
  }

  beginWatch () {
    if (!this.started || this.suspended || document.visibilityState === 'hidden' || this.watchId !== null) return
    if (!navigator.geolocation) { this.report('unavailable'); return }
    this.report('searching')
    const generation = ++this.generation
    this.watchId = navigator.geolocation.watchPosition(
      position => { if (generation === this.generation) this.receive(position) },
      error => {
        if (generation !== this.generation) return
        if (error.code === 1) { this.endWatch(); this.report('denied') }
        else this.report(error.code === 3 ? 'timeout' : 'unavailable')
      },
      OPTIONS
    )
    this.timer = setInterval(() => {
      if (this.lastFix && Date.now() - this.lastFix.timestamp > STALE_MS) this.report('stale')
    }, 5000)
  }

  endWatch () {
    ++this.generation
    if (this.watchId !== null) navigator.geolocation?.clearWatch(this.watchId)
    this.watchId = null
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
  }

  receive (position) {
    const { latitude: lat, longitude: lng, accuracy } = position.coords ?? {}
    const timestamp = position.timestamp
    const now = Date.now()
    if (![lat, lng, accuracy, timestamp].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || accuracy < 0) return
    if (now - timestamp > MAX_FIX_AGE_MS || timestamp > now + 1000 || (this.lastFix && timestamp <= this.lastFix.timestamp)) return
    this.lastFix = { timestamp }
    const next = { lat, lng, accuracy, timestamp }
    const previous = this.position

    // Keep real fixes; ignore minor drift and a briefly worse reading.
    const recentlyAccepted = previous && now - previous.timestamp < STALE_MS
    const worse = previous && accuracy > Math.max(50, previous.accuracy * 2)
    if (recentlyAccepted && worse) { this.report('weak', accuracy); return }
    const movement = previous ? separation(previous, next) : Infinity
    const drift = previous ? Math.max(3, Math.min(previous.accuracy, accuracy) * 0.5) : 0
    const improved = previous && accuracy < previous.accuracy * 0.8
    if (!previous || movement >= drift || improved || !recentlyAccepted) {
      this.position = next
      this.onLocation(next)
    }
    this.report(accuracy > 100 ? 'weak' : 'ready', accuracy)
  }
}
