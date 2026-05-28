import Phaser from 'phaser'
import { render } from 'solid-js/web'

import './styles.css'

import {
  onAgentHello,
  onAgentReply,
  onAgentStatus,
  onAgentToken,
  onHistory,
  onRemoved,
  onRoster,
  onSpawned,
  startAgentClient
} from './services/agentClient'
import {
  appendAgentToken,
  chatAgent,
  closeChat,
  commitAgentReply,
  recordAgentStatus,
  setChatHistory,
  setLiveMode,
  setSpawnOpen,
  spawnOpen
} from './overlay/state'
import { addVillager, removeVillager, setRoster } from './state/roster'
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
onAgentStatus((agentId, status) => recordAgentStatus(agentId, status))
onAgentToken((agentId, text) => appendAgentToken(agentId, text))
onAgentReply((agentId, text) => commitAgentReply(agentId, text))
onRoster((villagers) => setRoster(villagers))
onSpawned((villager) => addVillager(villager))
onRemoved((agentId) => removeVillager(agentId))
onHistory((agentId, lines) => setChatHistory(agentId, lines))
startAgentClient()

// Escape closes whichever overlay panel is open.
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (spawnOpen()) {
      event.preventDefault()
      setSpawnOpen(false)
    } else if (chatAgent() !== undefined) {
      event.preventDefault()
      closeChat()
    }
  }
})
