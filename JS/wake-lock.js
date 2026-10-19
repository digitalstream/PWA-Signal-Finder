// Screen Wake Lock lifecycle, separate from the menu and compass.
const STORAGE_KEY = 'signalFinder.keepScreenAwake'

export class ScreenAwake {
  constructor ({ onChange = () => {} } = {}) {
    this.onChange = onChange
    this.enabled = false
    this.lock = null
    this.pending = null
    this.error = false
    this.supported = Boolean(navigator.wakeLock?.request)
    try { this.enabled = localStorage.getItem(STORAGE_KEY) === 'true' } catch {}

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.acquire()
      else void this.release()
    })
    window.addEventListener('pagehide', () => { void this.release() })
    window.addEventListener('pageshow', () => { void this.acquire() })
    window.addEventListener('focus', () => { void this.acquire() })
  }

  update () {
    let status = 'Off — normal screen timeout.'
    if (!this.supported) status = 'Not available in this browser.'
    else if (this.enabled) {
      if (this.lock && !this.lock.released) status = 'On — keeping the screen awake.'
      else if (this.error) status = 'Not active — switch off and on to retry.'
      else if (document.visibilityState !== 'visible') status = 'Paused while Signal Finder is in the background.'
      else if (this.pending) status = 'Turning on…'
      else status = 'Paused — switch off and on to resume.'
    }
    this.onChange({
      enabled: this.enabled && this.supported,
      active: Boolean(this.lock && !this.lock.released),
      supported: this.supported,
      status
    })
  }

  async setEnabled (enabled) {
    this.enabled = Boolean(enabled && this.supported)
    this.error = false
    try { localStorage.setItem(STORAGE_KEY, String(this.enabled)) } catch {}
    if (this.enabled) await this.acquire()
    else await this.release()
    this.update()
  }

  async acquire () {
    if (!this.enabled || !this.supported || document.visibilityState !== 'visible') {
      this.update()
      return
    }
    if ((this.lock && !this.lock.released) || this.pending) return

    this.error = false
    // A microtask lets pending be set before callbacks can update the UI.
    // The actual request is still made directly in the originating click.
    let request
    try { request = navigator.wakeLock.request('screen') }
    catch (error) { request = Promise.reject(error) }

    const task = Promise.resolve(request).then(async lock => {
      // The user may have switched off or left while the request was pending.
      if (!this.enabled || document.visibilityState !== 'visible') {
        await lock.release()
        return
      }
      this.lock = lock
      lock.addEventListener('release', () => {
        if (this.lock !== lock) return
        this.lock = null
        this.update()
      })
    }).catch(() => { this.error = true })

    this.pending = task
    this.update()
    await task
    if (this.pending === task) this.pending = null
    this.update()
  }

  async release () {
    const lock = this.lock
    this.lock = null
    if (lock && !lock.released) {
      try { await lock.release() } catch {}
    }
    this.update()
  }
}
