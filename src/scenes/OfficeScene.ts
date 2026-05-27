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
const tilesetKey = 'tileset'
const charactersKey = 'characters'

/**
 * The walkable office floor. Loads the theme's artwork, builds a furnished room
 * from a tilemap, places animated character sprites at their workstations, and
 * drives a player avatar with the keyboard. Walls and desks block movement, and
 * proximity to an agent is pushed into the Solid overlay's reactive state.
 */
export class OfficeScene extends Phaser.Scene {
  private player!: Character
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | undefined
  private keys: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key> | undefined

  private readonly characters = new Map<string, Character>()
  private furnishing!: Furnishing

  /** The agent the player is currently close enough to interact with. */
  private nearbyAgentId: string | undefined

  constructor() {
    super('office')
  }

  preload(): void {
    const tileset = activeTheme.tileset
    const characters = activeTheme.characters

    this.load.spritesheet(tilesetKey, tileset.path, {
      frameWidth: tileset.frameSize,
      frameHeight: tileset.frameSize,
      margin: 0,
      spacing: tileset.margin
    })

    this.load.spritesheet(charactersKey, characters.path, {
      frameWidth: characters.frameSize,
      frameHeight: characters.frameSize,
      margin: 0,
      spacing: characters.margin
    })
  }

  create(): void {
    this.furnishing = furnish(activeTheme)

    this.drawTiles(this.furnishing.floor)
    this.drawTiles(this.furnishing.decor)
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
   * Zoom the camera so the room comfortably fills the viewport. The room is
   * smaller than most windows, so without this it renders 1:1 in a corner.
   */
  private applyZoom(): void {
    const roomWidth = officeColumns * tileSize
    const roomHeight = officeRows * tileSize

    const zoom = Math.max(1, Math.min(this.scale.width / roomWidth, this.scale.height / roomHeight))

    this.cameras.main.setZoom(zoom)
  }

  override update(_time: number, delta: number): void {
    this.movePlayer(delta)
    this.updateProximity()
  }

  /**
   * Draw a list of tile placements as scaled images, depth-sorted by row so
   * lower tiles overlap higher ones naturally.
   *
   * @param placements - The tiles to draw.
   */
  private drawTiles(placements: Furnishing['floor']): void {
    const scale = tileSize / activeTheme.tileset.frameSize

    for (const placement of placements) {
      const image = this.add.image(
        placement.column * tileSize,
        placement.row * tileSize,
        tilesetKey,
        placement.index
      )

      image.setOrigin(0, 0)
      image.setScale(scale)
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
   * Build one agent character at its workstation chair tile.
   *
   * @param agent - The descriptor to render.
   * @param frame - The character sheet frame to use.
   * @returns The created Character.
   */
  private createCharacter(agent: AgentDescriptor, frame: number): Character {
    const { x, y } = tileToPixel(agent.tile.column, agent.tile.row)

    // Seat the agent tucked just under the desk rather than floating a full
    // tile below it.
    const character = new Character(this, x, y - tileSize * 0.35, {
      name: agent.name,
      texture: charactersKey,
      frame,
      status: agent.status,
      size: tileSize * 0.95
    })

    character.setDepth(agent.tile.row)

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
      size: tileSize * 0.95
    })

    this.player.setDepth(playerSpawn.row)
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
   * Move the avatar from the current key state, clamped to the room and stopped
   * by blocked cells. Each axis is resolved separately so the player can slide
   * along a wall instead of sticking to it.
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

    if (!this.isBlocked(nextX, this.player.y)) {
      this.player.x = nextX
    }

    if (!this.isBlocked(this.player.x, nextY)) {
      this.player.y = nextY
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
