import Phaser from 'phaser'

import type { AgentStatus } from '../world'

/** Emoji-style glyphs used as a quick visual cue for each status. */
const statusGlyph: Record<AgentStatus, string> = {
  idle: '💤',
  working: '⚙️',
  talking: '💬'
}

/**
 * A placeholder character: a tinted rounded body with a head, a floating name
 * label, and an optional status bubble. Built from Phaser graphics so the
 * project runs with no external art. Swapping in a real spritesheet later only
 * touches this class.
 */
export class Character extends Phaser.GameObjects.Container {
  private readonly chassis: Phaser.GameObjects.Graphics
  private readonly label: Phaser.GameObjects.Text
  private readonly bubble: Phaser.GameObjects.Text

  /** Pixel radius used by the scene for body-to-body and interaction checks. */
  readonly radius = 13

  constructor(scene: Phaser.Scene, x: number, y: number, name: string, color: number, status: AgentStatus) {
    super(scene, x, y)

    this.chassis = scene.add.graphics()
    this.drawBody(color)

    this.label = scene.add.text(0, 18, name, {
      fontFamily: 'ui-monospace, monospace',
      fontSize: '11px',
      color: '#e6e9f0'
    })
    this.label.setOrigin(0.5, 0)

    this.bubble = scene.add.text(0, -30, statusGlyph[status], {
      fontSize: '16px'
    })
    this.bubble.setOrigin(0.5, 0.5)

    this.add([this.chassis, this.label, this.bubble])

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
   * Toggle a highlight ring, used when the player is close enough to interact.
   *
   * @param active - Whether the highlight should be shown.
   */
  setHighlighted(active: boolean): void {
    this.label.setColor(active ? '#ffffff' : '#e6e9f0')
    this.setScale(active ? 1.08 : 1)
  }

  /**
   * Draw the placeholder body shape with the given tint.
   *
   * @param color - Fill colour for the body.
   */
  private drawBody(color: number): void {
    const graphics = this.chassis

    graphics.clear()

    graphics.fillStyle(0x000000, 0.25)
    graphics.fillEllipse(0, 16, 26, 8)

    graphics.fillStyle(color, 1)
    graphics.fillRoundedRect(-10, -6, 20, 22, 6)

    graphics.fillStyle(0xffe8c8, 1)
    graphics.fillCircle(0, -12, 7)
  }
}
