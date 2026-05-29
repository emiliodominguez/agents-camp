import Phaser from 'phaser'

import type { AgentStatus } from './world'

/** Emoji-style glyphs used as a quick visual cue for each status. */
const statusGlyph: Record<AgentStatus, string> = {
  idle: '💤',
  working: '⚙️',
  talking: '💬'
}

/** The four facing directions a character can take. */
export type Facing = 'down' | 'up' | 'left' | 'right'

/**
 * The animation key for a character's directional state. `left` reuses the
 * `right` (side) sheet, mirrored at render time.
 *
 * @param textureKey - The character's base texture key.
 * @param facing - Which way the character faces.
 * @param state - Idle or walking.
 * @returns The registered animation key.
 */
export function motionAnimationKey(textureKey: string, facing: Facing, state: 'idle' | 'walk'): string {
  const sheet = facing === 'down' ? 'd' : facing === 'up' ? 'u' : 's'

  return `${textureKey}-${sheet}-${state}`
}

/**
 * Depth for the floating name/status overlays. Kept well above any world
 * geometry (ground, structures, characters) so labels are never chopped by a
 * building drawn in the row below.
 */
const overlayDepth = 9000

/** Options for constructing a character. */
export interface CharacterOptions {
  /** Display name on the floor label. */
  name: string
  /** Base texture key (per-direction sheets derive from it). */
  texture: string
  /** Initial lifecycle state. */
  status: AgentStatus
  /** Rendered sprite size in pixels (source frames are scaled to this). */
  size: number
  /** Show the floating status badge above the head. Off for the player. */
  showStatus?: boolean
}

/**
 * A character in the camp: a real animated pixel-art villager that faces the
 * way it moves and plays an idle or walk cycle accordingly, with a floating
 * name label and a status bubble above its head.
 */
export class Character extends Phaser.GameObjects.Container {
  private readonly sprite: Phaser.GameObjects.Sprite
  private readonly label: Phaser.GameObjects.Text
  private readonly bubble: Phaser.GameObjects.Text | undefined
  private readonly textureKey: string
  private readonly labelOffsetY: number
  private readonly bubbleOffsetY: number

  private facing: Facing = 'down'
  private moving = false

  /** Pixel radius used by the scene for interaction checks. */
  readonly radius: number

  constructor(scene: Phaser.Scene, x: number, y: number, options: CharacterOptions) {
    super(scene, x, y)

    this.textureKey = options.texture
    this.radius = options.size * 0.6
    this.labelOffsetY = options.size * 0.5
    this.bubbleOffsetY = -options.size * 0.55

    this.sprite = scene.add.sprite(0, 0, `${options.texture}-d-idle`)
    this.sprite.setDisplaySize(options.size, options.size)
    this.sprite.play(motionAnimationKey(this.textureKey, 'down', 'idle'))
    this.add(this.sprite)

    // The name label and status badge live at the top of the display list
    // (not inside the container) so structures in the row below never chop
    // them. The scene keeps their positions in sync via syncOverlay().
    this.label = scene.add.text(x, y + this.labelOffsetY, options.name, {
      fontFamily: 'ui-monospace, monospace',
      fontSize: '11px',
      color: '#e6e9f0'
    })
    this.label.setOrigin(0.5, 0)
    this.label.setShadow(0, 1, '#000000', 2)
    this.label.setDepth(overlayDepth)

    if (options.showStatus !== false) {
      this.bubble = scene.add.text(x, y + this.bubbleOffsetY, statusGlyph[options.status], {
        fontSize: '15px'
      })
      this.bubble.setOrigin(0.5, 0.5)
      this.bubble.setDepth(overlayDepth)
    }

    scene.add.existing(this)
  }

  /**
   * Reposition the floating name/status overlays to track the character. Called
   * by the scene each frame because the overlays are top-level objects rather
   * than container children.
   */
  syncOverlay(): void {
    this.label.setPosition(this.x, this.y + this.labelOffsetY)
    this.bubble?.setPosition(this.x, this.y + this.bubbleOffsetY)
  }

  /** Destroy the character and its top-level overlays together. */
  override destroy(fromScene?: boolean): void {
    this.label.destroy()
    this.bubble?.destroy()
    super.destroy(fromScene)
  }

  /**
   * Update the facing and walk/idle animation. Only changes the playing
   * animation when something actually changed, so the cycle isn't restarted
   * every frame.
   *
   * @param facing - The direction to face.
   * @param moving - Whether the character is walking.
   */
  setMotion(facing: Facing, moving: boolean): void {
    if (facing === this.facing && moving === this.moving) {
      return
    }

    this.facing = facing
    this.moving = moving

    // The side sheet faces left; mirror it for right.
    this.sprite.setFlipX(facing === 'right')
    this.sprite.play(motionAnimationKey(this.textureKey, facing, moving ? 'walk' : 'idle'), true)
  }

  /** The direction the character currently faces. */
  get currentFacing(): Facing {
    return this.facing
  }

  /**
   * Update the floating status bubble.
   *
   * @param status - The new lifecycle state to display.
   */
  setStatus(status: AgentStatus): void {
    this.bubble?.setText(statusGlyph[status])
  }

  /**
   * Toggle a highlight, used when the player is close enough to interact.
   *
   * @param active - Whether the highlight should be shown.
   */
  setHighlighted(active: boolean): void {
    this.label.setColor(active ? '#ffffff' : '#e6e9f0')
    this.label.setFontStyle(active ? 'bold' : 'normal')
  }

  /**
   * Tint the sprite to recolor it (used to distinguish the player from agents
   * that share the same citizen sheet).
   *
   * @param color - RGB tint as a 24-bit hex value (e.g. `0xfff0d0`).
   */
  setSpriteTint(color: number): void {
    this.sprite.setTint(color)
  }
}
