import { ScreenAwake } from './wake-lock.js'

let menuState = null

export function toggleSideMenu () {
  menuState?.setOpen(!menuState.open)
}

export function setupMenu () {
  if (menuState) return
  const menu = document.getElementById('sideMenu')
  const button = document.getElementById('menuButton')
  const backdrop = document.getElementById('menuBackdrop')
  const select = document.getElementById('areaSelect')
  if (!menu || !button || !backdrop || !select) return

  // Preserve the existing area selector and its options/listeners.
  select.remove()
  menu.innerHTML = `
    <div class="menu-heading">
      <div><p class="menu-eyebrow">SIGNAL FINDER</p><h2 id="menuTitle">Settings</h2></div>
      <button type="button" class="menu-close" aria-label="Close menu">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6L18 18M18 6L6 18" /></svg>
      </button>
    </div>
    <div class="menu-section">
      <label class="menu-label" for="areaSelect">Transmitter area</label>
      <div class="menu-area-control"></div>
    </div>
    <div class="menu-setting">
      <div><span id="keepAwakeLabel" class="menu-label">Keep screen awake</span>
        <p id="keepAwakeStatus" class="menu-status" role="status" aria-live="polite"></p></div>
      <button type="button" id="keepAwakeToggle" class="menu-switch" role="switch"
        aria-checked="false" aria-labelledby="keepAwakeLabel" aria-describedby="keepAwakeStatus"></button>
    </div>
    <a href="#" id="aboutLink" class="menu-about">
      <span>About Signal Finder</span>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5L16 12L9 19" /></svg>
    </a>`
  menu.querySelector('.menu-area-control').appendChild(select)

  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8H20M4 16H20" /></svg>'
  button.setAttribute('aria-label', 'Open settings menu')
  button.setAttribute('aria-controls', 'sideMenu')
  button.setAttribute('aria-expanded', 'false')
  button.setAttribute('aria-haspopup', 'dialog')
  menu.setAttribute('role', 'dialog')
  menu.setAttribute('aria-modal', 'true')
  menu.setAttribute('aria-labelledby', 'menuTitle')
  menu.setAttribute('aria-hidden', 'true')
  menu.inert = true
  backdrop.setAttribute('aria-hidden', 'true')

  const overview = document.querySelector('.container')
  const closeButton = menu.querySelector('.menu-close')
  let overviewWasInert = false
  menuState = {
    open: false,
    setOpen (open) {
      if (open === this.open) return
      this.open = open
      menu.classList.toggle('active', open)
      backdrop.classList.toggle('active', open)
      menu.setAttribute('aria-hidden', String(!open))
      button.setAttribute('aria-expanded', String(open))
      menu.inert = !open
      if (open) {
        overviewWasInert = overview?.inert ?? false
        if (overview) overview.inert = true
        closeButton.focus({ preventScroll: true })
      } else {
        if (overview) overview.inert = overviewWasInert
        button.focus({ preventScroll: true })
      }
    }
  }
  button.addEventListener('click', toggleSideMenu)
  closeButton.addEventListener('click', () => menuState.setOpen(false))
  backdrop.addEventListener('click', () => menuState.setOpen(false))
  document.addEventListener('keydown', event => {
    if (!menuState.open) return
    if (event.key === 'Escape') {
      event.preventDefault()
      menuState.setOpen(false)
    } else if (event.key === 'Tab') {
      const controls = [...menu.querySelectorAll('button:not(:disabled), select:not(:disabled), a[href]')]
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
  })

  const toggle = document.getElementById('keepAwakeToggle')
  const status = document.getElementById('keepAwakeStatus')
  const screenAwake = new ScreenAwake({
    onChange (state) {
      toggle.setAttribute('aria-checked', String(state.enabled))
      toggle.disabled = !state.supported
      status.textContent = state.status
    }
  })
  toggle.addEventListener('click', () => { void screenAwake.setEnabled(!screenAwake.enabled) })
  screenAwake.update()
  void screenAwake.acquire()
}
