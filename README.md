Signal Transmitter Finder PWA

This is a Progressive Web Application (PWA) designed to help users find nearby signal transmitters based on their current location. The application utilizes HTML, CSS, JavaScript, and geolocation APIs to provide an interactive experience.

Features:

- Compass Rotation: The app dynamically rotates the compass needle based on the device's orientation and direction of nearby transmitters.
- Geolocation: Automatically detects the user's location using the Geolocation API.
- Transmitter Display: Shows arrows representing signal transmitters with their bearing and distance from the user.
- Dropdown Filter: Allows users to filter transmitters by area.
- Responsive Design: Works seamlessly on both desktop and mobile devices.

Getting Started:

1. Clone the Repository:
   git clone https://github.com/digitalstream/PWA-Signal-Finder.git
   cd signal-transmitter-finder

2. Install Dependencies (if any):
   This PWA is static and does not require additional node modules, but if there are any dependencies, you can install them using:
   npm install

3. Run the Application:
   Open the index.html file in a web browser. Alternatively, use a local server to serve the files:
   npx http-server

4. Permissions:
   - Ensure that location services are enabled on your device.
   - On iOS devices, you may need to grant permission for motion and orientation access.

Usage:

1. Permission Request: Upon loading the app, a permission request will be made for accessing motion and orientation sensors. Grant this permission for optimal functionality.
2. Transmitter Display: Once location is detected, arrows representing nearby transmitters will appear on the screen. Hover over or tap on an arrow to get more details.
3. Filter Transmitters: Use the dropdown menu to filter transmitters by area.

Configuration:

- Transmitter Data: The app uses a transmitters.json file for storing transmitter data. You can modify this file to include your own transmitter information.

  ```json
  [
    {
      "id": "1",
      "name": "Transmitter A",
      "lat": 37.7749,
      "lng": -122.4194,
      "area": "Area X"
    },
    {
      "id": "2",
      "name": "Transmitter B",
      "lat": 37.7750,
      "lng": -122.4195,
      "area": "Area Y"
    }
    // Add more transmitters as needed
  ]

  Contributing:
  Feel free to fork this repository and contribute with new features, bug fixes, or improvements. Make sure to follow the existing code style and update the README.md if necessary.
  ```

Fork the Repository: `git clone https://github.com/digitalstream/PWA-Signal-Finder.git`
Create a New Branch: `git checkout -b feature/new-feature`
Commit Your Changes: `git commit -m "Add new feature"`
Push to the Branch: `git push origin feature/new-feature`
Create a Pull Request: Open a pull request on GitHub and describe your changes.

License: This project is licensed under the MIT License - see the LICENSE file for details.

Acknowledgments:

Special thanks to the contributors who have helped improve this PWA.
Inspiration from various open-source projects focused on location-based services.
