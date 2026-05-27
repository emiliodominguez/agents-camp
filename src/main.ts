import Phaser from 'phaser'
import { render } from 'solid-js/web'

import './styles.css'

import { OfficeScene } from './scenes/OfficeScene'
import { Overlay } from './overlay/Overlay'

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  pixelArt: true,
  backgroundColor: '#0b0d12',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: '100%',
    height: '100%'
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
