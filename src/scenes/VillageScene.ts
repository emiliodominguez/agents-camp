import Phaser from 'phaser'

import { Character } from '../objects/Character'
import { setNearbyAgent } from '../overlay/state'
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
const playerSpeed = 150

/** Texture keys for the loaded sheets. */
const groundKey = 'ground'
const charactersKey = 'characters'

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

  private readonly characters = new Map<string, Character>()
  private furnishing!: Furnishing

  /** The agent the player is currently close enough to interact with. */
  private nearbyAgentId: string | undefined

  constructor() {
    super('village')
  }

  preload(): void {
    const ground = activeTheme.ground.sheet
    const characters = activeTheme.characters

    this.load.spritesheet(groundKey, ground.path, {
      frameWidth: ground.frameSize,
      frameHeight: ground.frameSize,
      margin: 0,
      spacing: ground.margin
    })

    this.load.spritesheet(charactersKey, characters.path, {
      frameWidth: characters.frameSize,
      frameHeight: characters.frameSize,
      margin: 0,
      spacing: characters.margin
    })

    // Each object sprite is its own native-size image.
    for (const sprite of Object.values(activeTheme.sprites)) {
      this.load.image(sprite.key, sprite.path)
    }
  }

  create(): void {
    this.furnishing = furnish(activeTheme)

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
  }

  /**
   * Zoom the camera so the scene comfortably fills the viewport. The scene is
   * smaller than most windows, so without this it renders 1:1 in a corner.
   */
  private applyZoom(): void {
    const sceneWidth = officeColumns * tileSize
    const sceneHeight = officeRows * tileSize

    const zoom = Math.max(1, Math.min(this.scale.width / sceneWidth, this.scale.height / sceneHeight))

    this.cameras.main.setZoom(zoom)
  }

  override update(_time: number, delta: number): void {
    this.movePlayer(delta)
    this.updateProximity()
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

  /** Instantiate a Character for every configured agent. */
  private spawnAgents(): void {
    activeTheme.characterFrames.forEach((frame, position) => {
      const agent = agents[position]

      if (agent === undefined) {
        return
      }

      this.characters.set(agent.id, this.createCharacter(agent, frame))
    })
  }

  /**
   * Build one agent character where the agent stands.
   *
   * @param agent - The descriptor to render.
   * @param frame - The character sheet frame to use.
   * @returns The created Character.
   */
  private createCharacter(agent: AgentDescriptor, frame: number): Character {
    const { x, y } = tileToPixel(agent.tile.column, agent.tile.row)

    const character = new Character(this, x, y, {
      name: agent.name,
      texture: charactersKey,
      frame,
      status: agent.status,
      size: tileSize * 1.1
    })

    character.setDepth(agent.tile.row + 0.5)

    return character
  }

  /** Create the player avatar at the spawn tile. */
  private spawnPlayer(): void {
    const { x, y } = tileToPixel(playerSpawn.column, playerSpawn.row)

    this.player = new Character(this, x, y, {
      name: 'You',
      texture: charactersKey,
      frame: activeTheme.characterFrames[0] ?? 0,
      status: 'idle',
      size: tileSize * 1.1
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
      return
    }

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
