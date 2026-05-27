import Phaser from 'phaser'

import type { AgentStatus } from '../world'

/** Emoji-style glyphs used as a quick visual cue for each status. */
const statusGlyph: Record<AgentStatus, string> = {
  idle: '💤',
  working: '⚙️',
  talking: '💬'
}

/** Options for constructing a character. */
export interface CharacterOptions {
  /** Display name on the floor label. */
  name: string
  /** Texture key of the loaded character spritesheet. */
  texture: string
  /**
   * Animation key to play on a loop (the character's idle cycle). The animation
   * must already be registered on the scene's animation manager.
   */
  animationKey: string
  /** Initial lifecycle state. */
  status: AgentStatus
  /** Rendered sprite size in pixels (source frames are scaled to this). */
  size: number
}

/**
 * A character in the camp: a real animated pixel-art villager playing a looping
 * idle cycle, with a floating name label and a status bubble above its head.
 */
export class Character extends Phaser.GameObjects.Container {
  private readonly sprite: Phaser.GameObjects.Sprite
  private readonly label: Phaser.GameObjects.Text
  private readonly bubble: Phaser.GameObjects.Text

  /** Pixel radius used by the scene for interaction checks. */
  readonly radius: number

  constructor(scene: Phaser.Scene, x: number, y: number, options: CharacterOptions) {
    super(scene, x, y)

    this.radius = options.size * 0.6

    this.sprite = scene.add.sprite(0, 0, options.texture)
    this.sprite.setDisplaySize(options.size, options.size)
    this.sprite.play(options.animationKey)

    this.label = scene.add.text(0, options.size * 0.5, options.name, {
      fontFamily: 'ui-monospace, monospace',
      fontSize: '11px',
      color: '#e6e9f0'
    })
    this.label.setOrigin(0.5, 0)
    this.label.setShadow(0, 1, '#000000', 2)

    this.bubble = scene.add.text(0, -options.size * 0.55, statusGlyph[options.status], {
      fontSize: '15px'
    })
    this.bubble.setOrigin(0.5, 0.5)

    this.add([this.sprite, this.label, this.bubble])

    scene.add.existing(this)
  }

  /**
   * Update the floating status bubble.
   *
   * @param status - The new lifecycle state to display.
   */
  setStatus(status: AgentStatus): void {
    this.bubble.setText(statusGlyph[status])
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
}
