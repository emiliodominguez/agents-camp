import Phaser from 'phaser'
import { render } from 'solid-js/web'

import './styles.css'

import { onAgentHello, onAgentReply, onAgentToken, startAgentClient } from './services/agentClient'
import { appendAgentToken, commitAgentReply, setLiveMode } from './overlay/state'
import { VillageScene } from './scenes/VillageScene'
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
  scene: VillageScene
})

// Exposed for browser-based verification during development.
if (import.meta.env.DEV) {
  ;(window as unknown as { game: Phaser.Game }).game = game
}

const overlayRoot = document.getElementById('overlay')

if (overlayRoot !== null) {
  render(Overlay, overlayRoot)
}

// Connect to the agent backend and route its stream into the overlay state.
onAgentHello((live) => setLiveMode(live))
onAgentToken((agentId, text) => appendAgentToken(agentId, text))
onAgentReply((agentId, text) => commitAgentReply(agentId, text))
startAgentClient()
