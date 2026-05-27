import Phaser from 'phaser'
import { render } from 'solid-js/web'

import './styles.css'

import { OfficeScene } from './scenes/OfficeScene'
import { Overlay } from './overlay/Overlay'
import { officeColumns, officeRows, tileSize } from './world'

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: officeColumns * tileSize,
  height: officeRows * tileSize,
  pixelArt: true,
  backgroundColor: '#0b0d12',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: OfficeScene
})

// Exposed for browser-based verification during development.
if (import.meta.env.DEV) {
  ;(window as unknown as { game: Phaser.Game }).game = game
}

const overlayRoot = document.getElementById('overlay')

if (overlayRoot !== null) {
  render(Overlay, overlayRoot)
}
