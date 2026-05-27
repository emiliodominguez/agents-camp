import Phaser from 'phaser'

import { Character, type Facing } from '../objects/Character'
import { onAgentStatus } from '../services/agentClient'
import { chatAgent, openChat, setNearbyAgent } from '../overlay/state'
import { activeTheme } from '../themes'
import { furnish, type Furnishing } from './furnish'
import {
  agents,
  interactionRadius,
  officeColumns,
  officeRows,
  playerSpawn,
  tileSize,
  tileToPixel,
  type AgentDescriptor
} from '../world'

/** Movement speed of the player avatar, in pixels per second. */
const playerSpeed = 105

/** Movement speed of wandering agents, in pixels per second (a slow amble). */
const wanderSpeed = 45

/** How far, in tiles, an agent may stray from its home while wandering. */
const wanderRadius = 2.4

/** Texture key for the loaded ground sheet. */
const groundKey = 'ground'

/** A wandering agent's home anchor and current ambling target. */
interface WanderState {
  /** Pixel home position the agent strays around. */
  home: { x: number; y: number }
  /** Current pixel target, or undefined while pausing. */
  target: { x: number; y: number } | undefined
  /** Seconds remaining to pause before choosing a new target. */
  pause: number
}

/**
 * The walkable scene. Loads the theme's ground tiles, object sprites, and
 * characters; tiles the ground; places each agent's home and the scattered
 * decor; and drives a player avatar with the keyboard. Object footprints block
 * movement, and proximity to an agent is pushed into the Solid overlay.
 */
export class VillageScene extends Phaser.Scene {
  private player!: Character
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | undefined
  private keys: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key> | undefined
  private talkKey: Phaser.Input.Keyboard.Key | undefined
  private unsubscribeStatus: (() => void) | undefined

  private readonly characters = new Map<string, Character>()
  private readonly wanderers = new Map<string, WanderState>()
  private furnishing!: Furnishing

  /** The agent the player is currently close enough to interact with. */
  private nearbyAgentId: string | undefined

  constructor() {
    super('village')
  }

  preload(): void {
    const ground = activeTheme.ground.sheet

    this.load.spritesheet(groundKey, ground.path, {
      frameWidth: ground.frameSize,
      frameHeight: ground.frameSize,
      margin: 0,
      spacing: ground.margin
    })

    // Each villager has six directional strips (down/side/up × idle/walk),
    // sliced into square frames.
    for (const character of activeTheme.characters) {
      for (const direction of ['d', 's', 'u'] as const) {
        for (const state of ['idle', 'walk'] as const) {
          this.load.spritesheet(`${character.key}-${direction}-${state}`, `${character.pathPrefix}-${direction}-${state}.png`, {
            frameWidth: character.frameSize,
            frameHeight: character.frameSize
          })
        }
      }
    }

    // Each object sprite is its own native-size image.
    for (const sprite of Object.values(activeTheme.sprites)) {
      this.load.image(sprite.key, sprite.path)
    }
  }

  create(): void {
    this.furnishing = furnish(activeTheme)

    this.registerAnimations()
    this.drawGround()
    this.drawObjects()
    this.spawnAgents()
    this.spawnPlayer()
    this.bindInput()

    this.cameras.main.setBackgroundColor(activeTheme.backgroundColor)
    this.cameras.main.setBounds(0, 0, officeColumns * tileSize, officeRows * tileSize)
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12)

    this.applyZoom()
    this.scale.on(Phaser.Scale.Events.RESIZE, this.applyZoom, this)

    // Reflect each agent's live backend status on its bubble.
    this.unsubscribeStatus = onAgentStatus((agentId, status) => {
      this.characters.get(agentId)?.setStatus(status)
    })

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribeStatus?.()
    })
  }

  /**
   * Zoom the camera to a fixed, comfortable scale and follow the player. The
   * world is larger than the viewport, so the edges scroll off-screen as the
   * player walks. The zoom drops on small viewports so a useful slice of the
   * world stays visible.
   */
  private applyZoom(): void {
    const baseZoom = 2

    // Never zoom in so far that fewer than ~12 tiles fit across the viewport.
    const minTilesAcross = 12
    const fitZoom = this.scale.width / (minTilesAcross * tileSize)

    const zoom = Math.max(1, Math.min(baseZoom, fitZoom))

    this.cameras.main.setZoom(zoom)
  }

  override update(_time: number, delta: number): void {
    this.handleTalkKey()
    this.updateWanderers(delta)

    // Freeze the player and proximity changes while a chat is open so typing
    // doesn't also drive the avatar. Agents keep animating (the one being
    // talked to turns to face the player).
    if (chatAgent() !== undefined) {
      return
    }

    this.movePlayer(delta)
    this.updateProximity()
  }

  /**
   * Amble each idle agent slowly around its home, pausing between strolls. The
   * agent the player is chatting with stops and faces the player instead.
   *
   * @param delta - Milliseconds since the previous frame.
   */
  private updateWanderers(delta: number): void {
    const seconds = delta / 1000
    const openChatId = chatAgent()?.id

    for (const [id, state] of this.wanderers) {
      const character = this.characters.get(id)

      if (character === undefined) {
        continue
      }

      // While being talked to, stop and turn toward the player.
      if (id === openChatId) {
        character.setMotion(this.directionToward(character, this.player), false)
        state.target = undefined

        continue
      }

      if (state.target === undefined) {
        state.pause -= seconds

        if (state.pause <= 0) {
          state.target = this.pickWanderTarget(state)
        } else {
          character.setMotion(character.currentFacing, false)
        }

        continue
      }

      const step = wanderSpeed * seconds
      const dx = state.target.x - character.x
      const dy = state.target.y - character.y
      const distance = Math.hypot(dx, dy)

      if (distance <= step) {
        // Arrived: settle and pause before the next stroll.
        character.x = state.target.x
        character.y = state.target.y
        character.setMotion(character.currentFacing, false)
        character.setDepth(Math.floor(character.y / tileSize) + 0.5)
        state.target = undefined
        state.pause = 1.5 + Math.random() * 3

        continue
      }

      const facing: Facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down'
      const nextX = character.x + (dx / distance) * step
      const nextY = character.y + (dy / distance) * step

      // Don't walk through obstacles; abandon a blocked target.
      if (this.isBlocked(nextX, nextY)) {
        state.target = undefined
        state.pause = 0.5

        continue
      }

      character.x = nextX
      character.y = nextY
      character.setMotion(facing, true)
      character.setDepth(Math.floor(character.y / tileSize) + 0.5)
    }
  }

  /**
   * Pick a random walkable pixel target within the wander radius of home.
   *
   * @param state - The agent's wander state.
   * @returns A target position, or undefined if none was found (the agent then pauses).
   */
  private pickWanderTarget(state: WanderState): { x: number; y: number } | undefined {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const angle = Math.random() * Math.PI * 2
      const radius = (0.6 + Math.random() * wanderRadius) * tileSize
      const x = state.home.x + Math.cos(angle) * radius
      const y = state.home.y + Math.sin(angle) * radius

      const inBounds = x > tileSize && x < officeColumns * tileSize - tileSize && y > tileSize && y < officeRows * tileSize - tileSize

      if (inBounds && !this.isBlocked(x, y)) {
        return { x, y }
      }
    }

    return undefined
  }

  /**
   * The cardinal direction from one character toward another.
   *
   * @param from - The character that turns.
   * @param to - The character to face.
   * @returns The facing direction.
   */
  private directionToward(from: Character, to: Character): Facing {
    const dx = to.x - from.x
    const dy = to.y - from.y

    return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down'
  }

  /**
   * Open the nearby agent's chat when E is pressed, or close the open chat when
   * Escape is pressed.
   */
  private handleTalkKey(): void {
    if (this.talkKey === undefined || !Phaser.Input.Keyboard.JustDown(this.talkKey)) {
      return
    }

    // Ignore E while typing in the chat input — let the keystroke land there.
    const active = document.activeElement

    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
      return
    }

    if (this.nearbyAgentId !== undefined) {
      openChat(this.nearbyAgentId)
    }
  }

  /** Tile the ground from the theme's frame pool. */
  private drawGround(): void {
    const scale = tileSize / activeTheme.ground.sheet.frameSize

    for (const cell of this.furnishing.ground) {
      const image = this.add.image(cell.column * tileSize, cell.row * tileSize, groundKey, cell.index)

      image.setOrigin(0, 0)
      image.setScale(scale)
      image.setDepth(-1000)
    }
  }

  /**
   * Draw each placed object at native size, anchored by its bottom centre so
   * tall objects sit on the ground. Depth follows the anchor row so nearer
   * objects overlap farther ones.
   */
  private drawObjects(): void {
    for (const placement of this.furnishing.objects) {
      const { x, y } = tileToPixel(placement.column, placement.row)

      const image = this.add.image(x, y + tileSize / 2, placement.sprite)

      image.setOrigin(0.5, 1)
      image.setDepth(placement.row)
    }
  }

  /**
   * Register looping idle and walk animations for each citizen, one per facing
   * sheet (down/side/up). Walk plays faster than idle.
   */
  private registerAnimations(): void {
    for (const character of activeTheme.characters) {
      for (const direction of ['d', 's', 'u'] as const) {
        const states: Array<{ state: 'idle' | 'walk'; frames: number; rate: number }> = [
          { state: 'idle', frames: character.idleFrames, rate: 4 },
          { state: 'walk', frames: character.walkFrames, rate: 8 }
        ]

        for (const { state, frames, rate } of states) {
          const textureKey = `${character.key}-${direction}-${state}`

          if (this.anims.exists(textureKey)) {
            continue
          }

          this.anims.create({
            key: textureKey,
            frames: this.anims.generateFrameNumbers(textureKey, { start: 0, end: frames - 1 }),
            frameRate: rate,
            repeat: -1
          })
        }
      }
    }
  }

  /** Instantiate a Character for every configured agent. */
  private spawnAgents(): void {
    agents.forEach((agent, position) => {
      const spec = activeTheme.characters[position]

      if (spec === undefined) {
        return
      }

      this.characters.set(agent.id, this.createCharacter(agent, spec.key))

      const { x, y } = tileToPixel(agent.tile.column, agent.tile.row)
      this.wanderers.set(agent.id, { home: { x, y }, target: undefined, pause: Math.random() * 2 })
    })
  }

  /**
   * Build one agent character where the agent stands.
   *
   * @param agent - The descriptor to render.
   * @param textureKey - The citizen texture to use.
   * @returns The created Character.
   */
  private createCharacter(agent: AgentDescriptor, textureKey: string): Character {
    const { x, y } = tileToPixel(agent.tile.column, agent.tile.row)

    const character = new Character(this, x, y, {
      name: agent.name,
      texture: textureKey,
      status: agent.status,
      size: tileSize * 1.4
    })

    character.setDepth(agent.tile.row + 0.5)

    return character
  }

  /** Create the player avatar at the spawn tile, using the first citizen. */
  private spawnPlayer(): void {
    const { x, y } = tileToPixel(playerSpawn.column, playerSpawn.row)
    const spec = activeTheme.characters[0]
    const textureKey = spec?.key ?? ''

    this.player = new Character(this, x, y, {
      name: 'You',
      texture: textureKey,
      status: 'idle',
      size: tileSize * 1.4
    })

    this.player.setDepth(playerSpawn.row + 0.5)
  }

  /** Wire up arrow keys and WASD. */
  private bindInput(): void {
    const keyboard = this.input.keyboard

    if (keyboard === null) {
      return
    }

    this.cursors = keyboard.createCursorKeys()
    this.keys = keyboard.addKeys('W,A,S,D') as Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>
    this.talkKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E)

    // Let keystrokes reach the chat input instead of being swallowed for the game.
    keyboard.disableGlobalCapture()
  }

  /**
   * Move the avatar from the current key state, clamped to the scene and
   * stopped by blocked cells. Each axis is resolved separately so the player
   * can slide along an obstacle instead of sticking to it.
   *
   * @param delta - Milliseconds since the previous frame.
   */
  private movePlayer(delta: number): void {
    const cursors = this.cursors
    const keys = this.keys

    if (cursors === undefined || keys === undefined) {
      return
    }

    const step = (playerSpeed * delta) / 1000

    let dx = 0
    let dy = 0

    if (cursors.left.isDown || keys.A.isDown) {
      dx -= 1
    }

    if (cursors.right.isDown || keys.D.isDown) {
      dx += 1
    }

    if (cursors.up.isDown || keys.W.isDown) {
      dy -= 1
    }

    if (cursors.down.isDown || keys.S.isDown) {
      dy += 1
    }

    if (dx === 0 && dy === 0) {
      this.player.setMotion(this.player.currentFacing, false)

      return
    }

    // Face the dominant axis of movement.
    const facing: Facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down'
    this.player.setMotion(facing, true)

    const length = Math.hypot(dx, dy)

    const nextX = this.player.x + (dx / length) * step
    const nextY = this.player.y + (dy / length) * step

    const margin = tileSize / 2

    const clampedX = Phaser.Math.Clamp(nextX, margin, officeColumns * tileSize - margin)
    const clampedY = Phaser.Math.Clamp(nextY, margin, officeRows * tileSize - margin)

    if (!this.isBlocked(clampedX, this.player.y)) {
      this.player.x = clampedX
    }

    if (!this.isBlocked(this.player.x, clampedY)) {
      this.player.y = clampedY
    }

    this.player.setDepth(Math.floor(this.player.y / tileSize) + 0.5)
  }

  /**
   * Whether a pixel position falls inside a blocked tile cell.
   *
   * @param x - Pixel x to test.
   * @param y - Pixel y to test.
   * @returns True when the cell at that position cannot be entered.
   */
  private isBlocked(x: number, y: number): boolean {
    const column = Math.floor(x / tileSize)
    const row = Math.floor(y / tileSize)

    return this.furnishing.blocked.has(`${column},${row}`)
  }

  /**
   * Find the closest agent within the interaction radius, highlight it, and
   * push the result into the overlay whenever the nearby agent changes.
   */
  private updateProximity(): void {
    let closestId: string | undefined
    let closestDistance = interactionRadius

    for (const [id, character] of this.characters) {
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, character.x, character.y)

      if (distance < closestDistance) {
        closestDistance = distance
        closestId = id
      }
    }

    if (closestId === this.nearbyAgentId) {
      return
    }

    if (this.nearbyAgentId !== undefined) {
      this.characters.get(this.nearbyAgentId)?.setHighlighted(false)
    }

    if (closestId !== undefined) {
      this.characters.get(closestId)?.setHighlighted(true)
    }

    this.nearbyAgentId = closestId

    setNearbyAgent(closestId)
  }
}
