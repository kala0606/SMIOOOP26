# SMIOOOP26

Works from Interim 2026.

## LEDinstall — "Out Of One's Place"

A p5.js clockwork checkerboard for an LED installation. Every second, four white squares slide away to reveal the words OUT / OF / ONE'S / PLACE, while nested sub-checkerboards rotate on the beat.

- Live: https://kala0606.github.io/SMIOOOP26/LEDinstall/
- Source: [`LEDinstall/`](LEDinstall/) (`index.html`, `style.css`, `sketch.js`; p5.js 1.9.4 from cdnjs)

### v2 — three.js + WebAudio

White cubes on textured black tumble one row (rotating on the X axis) to reveal the words each second, under a moving key light with soft shadows and a static front-on camera. Press SOUND ON for a 120 bpm house loop composed from where the cubes land: the words' positions pick the chord, each tumbling cube plays a note (row = chord tone, column = octave and pan), and cubes landing home go tick… tock….

- Live: https://kala0606.github.io/SMIOOOP26/LEDinstall/v2/
- Source: [`LEDinstall/v2/`](LEDinstall/v2/) (`index.html`, `style.css`, `main.js`, `audio.js`; three.js 0.160.0 from jsDelivr)

To run locally, open `LEDinstall/index.html` in a browser or serve the folder with any static server.
