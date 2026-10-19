# Signal Finder PWA

**Version 5.17**

A mobile web app for finding New Zealand TV transmitters and calculating the direction to point an antenna.

[Open the live app](https://signalfinder.bettermediahub.com/)

## What it does

- Shows the closest four transmitters by default, with true bearing and distance.
- Supports area selection. Auckland shows Sky Tower, Remuera, Pine Hill and Waiatarua in the overview.
- Opens a larger transmitter view with a live arrow and site information. Swipe left or right to browse every transmitter in that area, including Waiheke.
- Converts magnetic compass readings to true north using an offline WMM2025 implementation.
- Handles Safari compass readings and Android Chrome absolute orientation events through separate sensor paths.
- Uses orientation geometry, exponential smoothing and continuous rotation through north to keep arrows steady and responsive.
- Requests high-accuracy location updates, checks reading quality and filters small drift or temporarily worse fixes.
- Pauses location tracking in the background and requests fresh readings on return.
- Includes optional screen wake lock, with reacquisition after returning to the app.
- Uses service-worker caching for offline access once the required files and transmitter data have been cached.

## Architecture

The app uses native browser APIs and ES modules. It has no JavaScript package dependencies or build step.

| File | Responsibility |
| --- | --- |
| `JS/app.js` | Transmitter selection, bearings and distances, SVG arrows, details sheet and page behaviour |
| `JS/compass.js` | Sensor permissions, heading calculations, smoothing and WMM2025 magnetic declination |
| `JS/location.js` | Location watching, accuracy checks, drift filtering and lifecycle handling |
| `JS/menu.js` | Settings drawer and keep-awake control |
| `JS/wake-lock.js` | Screen Wake Lock API lifecycle |
| `CSS/` | Page, compass, transmitter, menu, About and glass styling |
| `transmitters.json` | Transmitter coordinates and site information |
| `service-worker.js` | App-shell cache and network-first transmitter-data retrieval |

## Running the app

Clone this repository and serve the project root with a static web server. No package installation is required.

Use HTTPS for phone testing. Localhost is suitable for development on the computer itself; opening the HTML file directly is not the supported workflow for ES modules and sensor APIs. The user must allow location and motion access, and the device must provide the required sensors.

Folder names are case-sensitive on many hosts: use `JS/` and `CSS/` consistently. The included `web.config` provides IIS hosting rules; it is not required by other web servers.

When changing app files, update the cache version in `service-worker.js` and keep its file list in sync with the deployed site.

## Current status

The base interface and navigation features are implemented. Simulated location and compass checks have been run during development. Outdoor alignment checks and physical-device/offline validation remain to be completed.

WMM2025 covers dates from 2025 through 2029; the magnetic model must be updated for 2030 onward. Phone sensor quality and reported location accuracy affect alignment.

Augmented reality is the next planned development stage. A camera overlay is not implemented in this version.

## Data and model

Transmitter information is maintained in `transmitters.json`. Magnetic-model coefficients are NOAA/BGS WMM2025 data, with the field calculations implemented locally in JavaScript. See the [official World Magnetic Model documentation](https://www.ncei.noaa.gov/products/world-magnetic-model).

## Licence

This project is licensed under the [MIT Licence](LICENSE).
