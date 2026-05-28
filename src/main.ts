import Phaser from 'phaser'
import { render } from 'solid-js/web'

import './styles.css'

import {
  onAgentHello,
  onAgentError,
  onAgentQuestion,
  onAgentReply,
  onAgentStatus,
  onAgentTool,
  onAgentToken,
  onConnectionChange,
  onHistory,
  onRemoved,
  onRoster,
  onSkills,
  onSpawned,
  onUsage,
  startAgentClient
} from './services/agent-client'
import {
  appendAgentQuestion,
  appendAgentToken,
  appendAgentTool,
  chatAgent,
  closeChat,
  commitAgentReply,
  recordAgentError,
  recordAgentStatus,
  setAgentConnectionState,
  setBackendStatus,
  setChatHistory,
  setSpawnOpen,
  spawnOpen
} from './overlay/state'
import { addVillager, removeVillager, setRoster } from './state/roster'
import { setSkills, setSkillsOpen, skillsOpen } from './state/skills'
import { setUsage, setUsageOpen, usageOpen } from './state/usage'
import { VillageScene } from './game/village-scene'
import { Overlay } from './overlay/overlay'

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
onAgentHello((hello) => setBackendStatus(hello))
onConnectionChange((state) => setAgentConnectionState(state))
onAgentStatus((agentId, status) => recordAgentStatus(agentId, status))
onAgentToken((agentId, text) => appendAgentToken(agentId, text))
onAgentReply((agentId, text, harness) => commitAgentReply(agentId, text, harness))
onAgentTool((agentId, tool) => appendAgentTool(agentId, tool))
onAgentQuestion((agentId, question, harness) => appendAgentQuestion(agentId, question, harness))
onAgentError((agentId, message, harness) => recordAgentError(agentId, message, harness))
onRoster((villagers) => setRoster(villagers))
onSpawned((villager) => addVillager(villager))
onRemoved((agentId) => removeVillager(agentId))
onHistory((agentId, lines) => setChatHistory(agentId, lines))
onSkills((list) => setSkills(list))
onUsage((snapshot) => setUsage(snapshot))
startAgentClient()

// Escape closes whichever overlay panel is open.
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (usageOpen()) {
      event.preventDefault()
      setUsageOpen(false)
    } else if (skillsOpen()) {
      event.preventDefault()
      setSkillsOpen(false)
    } else if (spawnOpen()) {
      event.preventDefault()
      setSpawnOpen(false)
    } else if (chatAgent() !== undefined) {
      event.preventDefault()
      closeChat()
    }
  }
})
