import Phaser from 'phaser'

import { Character } from '../objects/Character'
import { setNearbyAgent } from '../overlay/state'
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

/**
 * The walkable office floor. Renders a tiled room, places agent characters at
 * their desks, and drives a player avatar with the keyboard. Proximity to an
 * agent is reported through the scene event emitter so the Solid overlay can
 * react without reaching into Phaser internals.
 */
export class OfficeScene extends Phaser.Scene {
  private player!: Character
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | undefined
  private keys: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key> | undefined

  private readonly characters = new Map<string, Character>()

  /** The agent the player is currently close enough to interact with. */
  private nearbyAgentId: string | undefined

  constructor() {
    super('office')
  }

  create(): void {
    this.drawFloor()
    this.drawDesks()
    this.spawnAgents()
    this.spawnPlayer()
    this.bindInput()

    this.cameras.main.setBackgroundColor('#11141c')
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1)
    this.cameras.main.setBounds(0, 0, officeColumns * tileSize, officeRows * tileSize)
  }

  override update(_time: number, delta: number): void {
    this.movePlayer(delta)
    this.updateProximity()
  }

  /** Paint the checkerboard floor and a border wall. */
  private drawFloor(): void {
    const floor = this.add.graphics()

    for (let row = 0; row < officeRows; row += 1) {
      for (let column = 0; column < officeColumns; column += 1) {
        const isAlternate = (row + column) % 2 === 0

        floor.fillStyle(isAlternate ? 0x1b2030 : 0x1f2538, 1)
        floor.fillRect(column * tileSize, row * tileSize, tileSize, tileSize)
      }
    }

    floor.lineStyle(4, 0x2c3450, 1)
    floor.strokeRect(0, 0, officeColumns * tileSize, officeRows * tileSize)
  }

  /** Draw simple desk rectangles in front of each agent's tile. */
  private drawDesks(): void {
    const desks = this.add.graphics()

    desks.fillStyle(0x33405e, 1)

    for (const agent of agents) {
      const { x, y } = tileToPixel(agent.tile.column, agent.tile.row)

      desks.fillRoundedRect(x - 18, y + 18, 36, 12, 3)
    }
  }

  /** Instantiate a Character for every configured agent. */
  private spawnAgents(): void {
    for (const agent of agents) {
      this.characters.set(agent.id, this.createCharacter(agent))
    }
  }

  /**
   * Build one agent character at its desk tile.
   *
   * @param agent - The descriptor to render.
   * @returns The created Character.
   */
  private createCharacter(agent: AgentDescriptor): Character {
    const { x, y } = tileToPixel(agent.tile.column, agent.tile.row)

    return new Character(this, x, y, agent.name, agent.color, agent.status)
  }

  /** Create the player avatar at the spawn tile. */
  private spawnPlayer(): void {
    const { x, y } = tileToPixel(playerSpawn.column, playerSpawn.row)

    this.player = new Character(this, x, y, 'You', 0xffffff, 'idle')
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
   * Move the avatar from the current key state, clamped to the room bounds.
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

    // Normalise so diagonal movement is not faster than cardinal movement.
    const length = Math.hypot(dx, dy)

    const margin = tileSize / 2
    const maxX = officeColumns * tileSize - margin
    const maxY = officeRows * tileSize - margin

    this.player.x = Phaser.Math.Clamp(this.player.x + (dx / length) * step, margin, maxX)
    this.player.y = Phaser.Math.Clamp(this.player.y + (dy / length) * step, margin, maxY)
  }

  /**
   * Find the closest agent within the interaction radius, highlight it, and
   * emit a `proximity` event whenever the nearby agent changes.
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
