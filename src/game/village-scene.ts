import Phaser from 'phaser'

import type { Villager } from '../../shared/agents'
import { Character, type Facing } from './character'
import { onAgentStatus, onRemoved, onRoster, onSpawned } from '../services/agent-client'
import {
  chatAgent,
  openChat,
  setNearbyAgent,
  setNearbyPlot,
  setSpawnOpen,
  spawnOpen
} from '../overlay/state'
import { villagers } from '../state/roster'
import { activeTheme } from '../themes'
import { furnish, type Furnishing } from './furnish'
import {
  emptyPlots,
  interactionRadius,
  campColumns,
  campRows,
  playerSpawn,
  seedVillagers,
  tileSize,
  tileToPixel
} from './world'

/** Set of "column,row" keys for every seed villager's home (so we know where
 * baked homes live). A villager spawning on one of these tiles doesn't plant a
 * new home; the existing baked house is reused. */
const seedTileKeys = new Set(seedVillagers.map((v) => `${v.tile.column},${v.tile.row}`))

/** Stable tile-key for a cell. */
function cellKey(cell: { column: number; row: number }): string {
  return `${cell.column},${cell.row}`
}

/** Movement speed of the player avatar, in pixels per second. */
const playerSpeed = 105

/** Movement speed of wandering agents, in pixels per second (a slow amble). */
const wanderSpeed = 45

/** How far, in tiles, a villager may stray from home while wandering. */
const wanderRadius = 2.4

/** Texture key for the loaded ground sheet. */
const groundKey = 'ground'

/** A wandering villager's home anchor and current ambling target. */
interface WanderState {
  /** Pixel home position the villager strays around. */
  home: { x: number; y: number }
  /** Current pixel target, or undefined while pausing. */
  target: { x: number; y: number } | undefined
  /** Seconds remaining to pause before choosing a new target. */
  pause: number
}

/**
 * The walkable scene. Loads the theme's ground tiles, object sprites, and
 * citizen characters; tiles the ground; draws the seed villagers' homes;
 * spawns characters from the live roster and follows runtime add/remove
 * events; drives a player avatar with the keyboard; opens chat or the spawn
 * dialog on E depending on what's nearby.
 */
export class VillageScene extends Phaser.Scene {
  private player!: Character
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | undefined
  private keys: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key> | undefined
  private talkKey: Phaser.Input.Keyboard.Key | undefined

  private readonly unsubscribers: Array<() => void> = []

  private readonly characters = new Map<string, Character>()
  private readonly wanderers = new Map<string, WanderState>()
  /** Sprite images for spawned villagers' homes (seed homes are baked into the layout). */
  private readonly spawnedHomes = new Map<string, Phaser.GameObjects.Image>()
  /** Visual affordances over each currently-empty plot, keyed by "column,row". */
  private readonly plotMarkers = new Map<string, Phaser.GameObjects.Container>()

  private furnishing!: Furnishing

  /** The villager the player is currently close enough to interact with. */
  private nearbyAgentId: string | undefined
  /** "column,row" key of the empty plot the player is currently near, if any. */
  private nearbyPlotKey: string | undefined

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

    // Each villager has six directional strips (down/side/up x idle/walk).
    // The spec's idle/walk sources can differ; archers reuse `_idle` for both.
    for (const character of activeTheme.characters) {
      for (const direction of ['d', 's', 'u'] as const) {
        for (const state of ['idle', 'walk'] as const) {
          const source = character[state]
          this.load.spritesheet(
            `${character.key}-${direction}-${state}`,
            `${character.pathPrefix}/${direction}${source.suffix}.png`,
            { frameWidth: character.frameSize, frameHeight: character.frameSize }
          )
        }
      }
    }

    for (const sprite of Object.values(activeTheme.sprites)) {
      if (sprite.animation === undefined) {
        this.load.image(sprite.key, sprite.path)

        continue
      }

      this.load.spritesheet(sprite.key, sprite.path, {
        frameWidth: sprite.animation.frameWidth,
        frameHeight: sprite.animation.frameHeight
      })
    }
  }

  create(): void {
    this.furnishing = furnish(activeTheme)

    this.registerAnimations()
    this.registerObjectAnimations()
    this.drawGround()
    this.drawObjects()
    this.syncPlots()
    this.spawnPlayer()
    this.bindInput()

    this.cameras.main.setBackgroundColor(activeTheme.backgroundColor)
    this.cameras.main.setBounds(0, 0, campColumns * tileSize, campRows * tileSize)
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12)

    this.applyZoom()
    this.scale.on(Phaser.Scale.Events.RESIZE, this.applyZoom, this)

    // Sync the scene with the live roster: add/remove characters as the
    // server's roster, spawned, and removed events arrive.
    this.unsubscribers.push(
      onRoster((next) => {
        this.syncCharacters(next)
        this.syncPlots()
      }),
      onSpawned((villager) => {
        this.addCharacter(villager)
        this.syncPlots()
      }),
      onRemoved((agentId) => {
        this.removeCharacter(agentId)
        this.syncPlots()
      }),
      onAgentStatus((agentId, status) => {
        this.characters.get(agentId)?.setStatus(status)
      })
    )

    // If the roster already has villagers (e.g. on hot reload), sync now.
    if (villagers().length > 0) {
      this.syncCharacters(villagers())
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const off of this.unsubscribers) {
        off()
      }
    })
  }

  /**
   * Zoom the camera to a fixed, comfortable scale and follow the player.
   */
  private applyZoom(): void {
    const baseZoom = 2

    const minTilesAcross = 12
    const fitZoom = this.scale.width / (minTilesAcross * tileSize)

    const zoom = Math.max(1, Math.min(baseZoom, fitZoom))

    this.cameras.main.setZoom(zoom)
  }

  override update(_time: number, delta: number): void {
    this.handleTalkKey()
    this.updateWanderers(delta)

    // Freeze the player and proximity changes while a chat or spawn dialog is
    // open so typing doesn't drive the avatar.
    if (chatAgent() !== undefined || spawnOpen()) {
      return
    }

    this.movePlayer(delta)
    this.updateProximity()
  }

  /**
   * Amble each idle villager slowly around their home, pausing between
   * strolls. The villager the player is chatting with stops and faces the
   * player instead.
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

  private pickWanderTarget(state: WanderState): { x: number; y: number } | undefined {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const angle = Math.random() * Math.PI * 2
      const radius = (0.6 + Math.random() * wanderRadius) * tileSize
      const x = state.home.x + Math.cos(angle) * radius
      const y = state.home.y + Math.sin(angle) * radius

      const inBounds =
        x > tileSize && x < campColumns * tileSize - tileSize && y > tileSize && y < campRows * tileSize - tileSize

      if (inBounds && !this.isBlocked(x, y)) {
        return { x, y }
      }
    }

    return undefined
  }

  private directionToward(from: Character, to: Character): Facing {
    const dx = to.x - from.x
    const dy = to.y - from.y

    return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down'
  }

  /**
   * Open the nearby villager's chat (E near a villager) or the spawn dialog
   * (E on an empty plot).
   */
  private handleTalkKey(): void {
    if (this.talkKey === undefined || !Phaser.Input.Keyboard.JustDown(this.talkKey)) {
      return
    }

    const active = document.activeElement

    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
      return
    }

    if (this.nearbyAgentId !== undefined) {
      openChat(this.nearbyAgentId)

      return
    }

    if (this.nearbyPlotKey !== undefined) {
      setSpawnOpen(true)
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

  private drawObjects(): void {
    for (const placement of this.furnishing.objects) {
      const { x, y } = tileToPixel(placement.column, placement.row)
      const offsetX = placement.offsetX ?? 0
      const offsetY = placement.offsetY ?? 0

      const spec = activeTheme.sprites[placement.sprite]

      if (spec?.animation !== undefined) {
        const sprite = this.add.sprite(x + offsetX, y + tileSize / 2 + offsetY, placement.sprite)

        sprite.setOrigin(0.5, 1)
        sprite.setDepth(placement.row + offsetY / tileSize)
        sprite.play(`${placement.sprite}-loop`)

        continue
      }

      const image = this.add.image(x + offsetX, y + tileSize / 2 + offsetY, placement.sprite)

      image.setOrigin(0.5, 1)
      image.setDepth(placement.row + offsetY / tileSize)
    }
  }

  /**
   * Currently-active spawn plots: the hand-placed ones, plus any seed home
   * whose villager isn't present in the live roster.
   *
   * @returns Cells the player can spawn a villager on.
   */
  private activePlots(): Array<{ column: number; row: number }> {
    const occupied = new Set(villagers().map((v) => cellKey(v.tile)))
    const seedPlots = seedVillagers
      .filter((seed) => !occupied.has(cellKey(seed.tile)))
      .map((seed) => seed.tile)

    return [...emptyPlots, ...seedPlots]
  }

  /**
   * Add or remove plot markers so the visible set matches `activePlots()`.
   * Called once at scene create and again on every roster change.
   */
  private syncPlots(): void {
    const next = this.activePlots()
    const nextKeys = new Set(next.map(cellKey))

    // Remove markers for plots that are no longer active.
    for (const [key, marker] of this.plotMarkers) {
      if (!nextKeys.has(key)) {
        marker.destroy()
        this.plotMarkers.delete(key)
      }
    }

    // Add markers for newly-active plots.
    for (const plot of next) {
      const key = cellKey(plot)

      if (this.plotMarkers.has(key)) {
        continue
      }

      const { x, y } = tileToPixel(plot.column, plot.row)
      const container = this.add.container(x, y)

      const flowers = this.add.image(0, tileSize / 4, 'flowers-2')
      flowers.setOrigin(0.5, 1)
      flowers.setAlpha(0.85)

      const plus = this.add.text(0, -tileSize / 2, '+', {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '20px',
        color: '#ffffff'
      })
      plus.setOrigin(0.5, 0.5)
      plus.setShadow(0, 1, '#000000', 2)

      container.add([flowers, plus])
      container.setDepth(plot.row + 0.5)

      this.tweens.add({
        targets: plus,
        y: plus.y - 3,
        duration: 1200,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut'
      })

      this.plotMarkers.set(key, container)
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
          { state: 'idle', frames: character.idle.frames, rate: 4 },
          { state: 'walk', frames: character.walk.frames, rate: 8 }
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

  /** Register looping animations for object sprite strips such as flags and campfires. */
  private registerObjectAnimations(): void {
    for (const sprite of Object.values(activeTheme.sprites)) {
      const animation = sprite.animation

      if (animation === undefined) {
        continue
      }

      const key = `${sprite.key}-loop`

      if (this.anims.exists(key)) {
        continue
      }

      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(sprite.key, { start: 0, end: animation.frames - 1 }),
        frameRate: animation.frameRate,
        repeat: -1
      })
    }
  }

  /**
   * Bring the scene in line with the given roster: add any newly-arrived
   * villagers and remove any that vanished.
   *
   * @param next - The latest roster.
   */
  private syncCharacters(next: Villager[]): void {
    const nextIds = new Set(next.map((villager) => villager.id))

    // Add any villager that doesn't have a sprite yet.
    for (const villager of next) {
      if (!this.characters.has(villager.id)) {
        this.addCharacter(villager)
      }
    }

    // Remove any character whose villager is gone from the roster.
    for (const id of [...this.characters.keys()]) {
      if (!nextIds.has(id)) {
        this.removeCharacter(id)
      }
    }
  }

  /**
   * Add a single villager to the scene: spawn the character, mark a wander
   * state, and (for non-seed villagers) plant their home above them.
   *
   * @param villager - The villager to render.
   */
  private addCharacter(villager: Villager): void {
    if (this.characters.has(villager.id)) {
      return
    }

    const { x, y } = tileToPixel(villager.tile.column, villager.tile.row)

    const character = new Character(this, x, y, {
      name: villager.name,
      texture: villager.sprite,
      status: 'idle',
      size: tileSize * 1.4
    })

    character.setDepth(villager.tile.row + 0.5)
    this.characters.set(villager.id, character)
    this.wanderers.set(villager.id, { home: { x, y }, target: undefined, pause: Math.random() * 2 })

    // Plant a home only when the villager isn't standing on a seed tile —
    // those tiles already have a baked house from the original layout.
    if (!seedTileKeys.has(cellKey(villager.tile))) {
      this.plantHome(villager)
    }
  }

  /**
   * Remove a villager (and their home, if dynamically planted).
   *
   * @param agentId - The villager id to remove.
   */
  private removeCharacter(agentId: string): void {
    this.characters.get(agentId)?.destroy()
    this.characters.delete(agentId)
    this.wanderers.delete(agentId)

    const home = this.spawnedHomes.get(agentId)

    if (home !== undefined) {
      home.destroy()
      this.spawnedHomes.delete(agentId)
    }
  }

  /**
   * Draw a home for a spawned villager, one row above where they stand.
   *
   * @param villager - The villager whose home to plant.
   */
  private plantHome(villager: Villager): void {
    const structure = activeTheme.sprites[villager.structure]

    if (structure === undefined) {
      return
    }

    const { x, y } = tileToPixel(villager.tile.column, villager.tile.row - 1)
    const image = this.add.image(x, y + tileSize / 2, villager.structure)
    image.setOrigin(0.5, 1)
    image.setDepth(villager.tile.row - 1)
    this.spawnedHomes.set(villager.id, image)
  }

  /** Create the player avatar at the spawn tile. */
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

    // Tint the player so they're visually distinct from the Planner (who
    // shares the same citizen sheet).
    this.player.setSpriteTint(0xfff0d0)
    this.player.setDepth(playerSpawn.row + 0.5)
  }

  private bindInput(): void {
    const keyboard = this.input.keyboard

    if (keyboard === null) {
      return
    }

    this.cursors = keyboard.createCursorKeys()
    this.keys = keyboard.addKeys('W,A,S,D') as Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>
    this.talkKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E)

    keyboard.disableGlobalCapture()
  }

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

    const facing: Facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down'
    this.player.setMotion(facing, true)

    const length = Math.hypot(dx, dy)

    const nextX = this.player.x + (dx / length) * step
    const nextY = this.player.y + (dy / length) * step

    const margin = tileSize / 2

    const clampedX = Phaser.Math.Clamp(nextX, margin, campColumns * tileSize - margin)
    const clampedY = Phaser.Math.Clamp(nextY, margin, campRows * tileSize - margin)

    if (!this.isBlocked(clampedX, this.player.y)) {
      this.player.x = clampedX
    }

    if (!this.isBlocked(this.player.x, clampedY)) {
      this.player.y = clampedY
    }

    this.player.setDepth(Math.floor(this.player.y / tileSize) + 0.5)
  }

  private isBlocked(x: number, y: number): boolean {
    const column = Math.floor(x / tileSize)
    const row = Math.floor(y / tileSize)

    return this.furnishing.blocked.has(`${column},${row}`)
  }

  /**
   * Find the closest villager (or empty plot) within the interaction radius
   * and push the result into the overlay state. Villagers take precedence
   * over plots.
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

    let closestPlot: { column: number; row: number } | undefined
    let plotDistance = interactionRadius

    if (closestId === undefined) {
      for (const plot of this.activePlots()) {
        const { x, y } = tileToPixel(plot.column, plot.row)
        const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, x, y)

        if (distance < plotDistance) {
          plotDistance = distance
          closestPlot = plot
        }
      }
    }

    if (closestId !== this.nearbyAgentId) {
      if (this.nearbyAgentId !== undefined) {
        this.characters.get(this.nearbyAgentId)?.setHighlighted(false)
      }

      if (closestId !== undefined) {
        this.characters.get(closestId)?.setHighlighted(true)
      }

      this.nearbyAgentId = closestId
      setNearbyAgent(closestId)
    }

    const plotKey = closestPlot !== undefined ? cellKey(closestPlot) : undefined

    if (plotKey !== this.nearbyPlotKey) {
      this.nearbyPlotKey = plotKey
      setNearbyPlot(closestPlot)
    }
  }

}
