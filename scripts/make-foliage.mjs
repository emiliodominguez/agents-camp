/**
 * Generate warm pixel-art trees, bushes and flowers as PNGs, with no image
 * dependencies — a tiny RGBA PNG encoder backed by Node's zlib. Each sprite is
 * authored on a small pixel grid then scaled up by an integer factor so it
 * stays crisp and matches the 32px village tiles.
 *
 * Run: node scripts/make-foliage.mjs
 * Output: public/assets/themes/village/objects/foliage/*.png
 */

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'public', 'assets', 'themes', 'village', 'objects', 'foliage')

/** CRC table for PNG chunk checksums. */
const crcTable = (() => {
  const table = new Uint32Array(256)

  for (let n = 0; n < 256; n += 1) {
    let c = n

    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }

    table[n] = c >>> 0
  }

  return table
})()

/**
 * CRC32 over a buffer.
 *
 * @param buffer - Bytes to checksum.
 * @returns The CRC32 value.
 */
function crc32(buffer) {
  let c = 0xffffffff

  for (let i = 0; i < buffer.length; i += 1) {
    c = crcTable[(c ^ buffer[i]) & 0xff] ^ (c >>> 8)
  }

  return (c ^ 0xffffffff) >>> 0
}

/**
 * Build a PNG chunk (length + type + data + CRC).
 *
 * @param type - Four-character chunk type.
 * @param data - Chunk payload.
 * @returns The encoded chunk.
 */
function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii')
  const body = Buffer.concat([typeBytes, data])
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)

  return Buffer.concat([length, body, crc])
}

/**
 * Encode an RGBA pixel buffer as a PNG.
 *
 * @param width - Image width.
 * @param height - Image height.
 * @param rgba - Row-major RGBA bytes (length width*height*4).
 * @returns The PNG file bytes.
 */
function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  // Each row prefixed with a filter byte (0 = none).
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)

  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }

  const idat = deflateSync(raw, { level: 9 })

  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

/**
 * A small drawing surface of `w`×`h` logical pixels. `set` paints one logical
 * pixel; `scaleTo` expands by an integer factor into final RGBA bytes.
 */
class Grid {
  constructor(w, h) {
    this.w = w
    this.h = h
    this.px = new Array(w * h).fill(null) // each cell: [r,g,b] or null (transparent)
  }

  set(x, y, color) {
    if (x < 0 || x >= this.w || y < 0 || y >= this.h) {
      return
    }

    this.px[y * this.w + x] = color
  }

  /** Fill a rectangle. */
  rect(x, y, w, h, color) {
    for (let dy = 0; dy < h; dy += 1) {
      for (let dx = 0; dx < w; dx += 1) {
        this.set(x + dx, y + dy, color)
      }
    }
  }

  /** Fill a filled circle (blobby canopy). */
  disc(cx, cy, r, color) {
    for (let y = -r; y <= r; y += 1) {
      for (let x = -r; x <= r; x += 1) {
        if (x * x + y * y <= r * r + r * 0.6) {
          this.set(cx + x, cy + y, color)
        }
      }
    }
  }

  scaleTo(scale) {
    const W = this.w * scale
    const H = this.h * scale
    const out = Buffer.alloc(W * H * 4)

    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const c = this.px[Math.floor(y / scale) * this.w + Math.floor(x / scale)]
        const o = (y * W + x) * 4

        if (c === null) {
          out[o + 3] = 0
        } else {
          out[o] = c[0]
          out[o + 1] = c[1]
          out[o + 2] = c[2]
          out[o + 3] = 255
        }
      }
    }

    return { width: W, height: H, rgba: out }
  }
}

// Warm palette — autumnal greens leaning gold, warm trunks.
const palette = {
  trunk: [110, 78, 50],
  trunkDark: [86, 58, 36],
  leafDark: [86, 122, 52],
  leafMid: [122, 162, 66],
  leafLight: [164, 196, 92],
  leafGold: [206, 192, 96],
  bushDark: [96, 132, 58],
  bushMid: [134, 170, 70],
  flower: [228, 138, 96],
  flowerAlt: [232, 196, 110],
  pine: [78, 120, 70],
  pineDark: [58, 96, 56],
  pineLight: [120, 158, 86]
}

/**
 * A round, full-canopy deciduous tree with warm dappled highlights.
 *
 * @param goldHeavy - When true, more golden highlight for an autumn feel.
 * @returns The grid.
 */
function deciduousTree(goldHeavy) {
  const g = new Grid(20, 26)

  // Trunk.
  g.rect(9, 18, 3, 7, palette.trunk)
  g.rect(9, 18, 1, 7, palette.trunkDark)
  // Roots flare.
  g.set(8, 24, palette.trunkDark)
  g.set(12, 24, palette.trunk)

  // Canopy — overlapping discs.
  g.disc(10, 10, 8, palette.leafDark)
  g.disc(8, 9, 6, palette.leafMid)
  g.disc(13, 11, 5, palette.leafMid)
  g.disc(10, 7, 5, palette.leafLight)

  // Warm dapples.
  const dappleColor = goldHeavy ? palette.leafGold : palette.leafLight
  const dapples = [
    [7, 6],
    [12, 6],
    [9, 4],
    [14, 9],
    [5, 11],
    [11, 9],
    [8, 12],
    [15, 12]
  ]

  for (const [x, y] of dapples) {
    g.set(x, y, dappleColor)
  }

  if (goldHeavy) {
    g.disc(13, 7, 3, palette.leafGold)
  }

  return g
}

/**
 * A conifer / pine for variety.
 *
 * @returns The grid.
 */
function pineTree() {
  const g = new Grid(18, 28)

  g.rect(8, 22, 2, 6, palette.trunkDark)

  // Stacked triangular tiers.
  const tiers = [
    { cy: 7, half: 7 },
    { cy: 13, half: 6 },
    { cy: 18, half: 5 }
  ]

  for (const { cy, half } of tiers) {
    for (let row = 0; row < 7; row += 1) {
      const width = Math.round((half * 2 + 1) * (row / 6))
      const startX = 9 - Math.floor(width / 2)

      for (let x = 0; x < width; x += 1) {
        const shade = row < 2 ? palette.pineLight : row < 5 ? palette.pine : palette.pineDark
        g.set(startX + x, cy + row - 3, shade)
      }
    }
  }

  return g
}

/**
 * A low round bush, optionally flowering.
 *
 * @param flowering - Whether to dot it with flowers.
 * @returns The grid.
 */
function bush(flowering) {
  const g = new Grid(16, 12)

  g.disc(8, 8, 6, palette.bushDark)
  g.disc(6, 7, 4, palette.bushMid)
  g.disc(10, 8, 4, palette.bushMid)
  g.disc(8, 6, 3, palette.leafLight)

  if (flowering) {
    for (const [x, y] of [
      [5, 5],
      [9, 4],
      [12, 7],
      [7, 8],
      [11, 9]
    ]) {
      g.set(x, y, x % 2 === 0 ? palette.flower : palette.flowerAlt)
    }
  }

  return g
}

/**
 * A small flower cluster for ground dressing.
 *
 * @returns The grid.
 */
function flowers() {
  const g = new Grid(12, 10)

  // Foliage base.
  g.disc(6, 8, 3, palette.bushMid)

  const blooms = [
    [3, 5],
    [6, 3],
    [9, 6],
    [5, 7],
    [8, 4]
  ]

  for (const [x, y] of blooms) {
    const color = (x + y) % 2 === 0 ? palette.flower : palette.flowerAlt
    g.set(x, y, color)
    g.set(x, y - 1, color)
    g.set(x - 1, y, color)
    g.set(x + 1, y, color)
  }

  return g
}

mkdirSync(outDir, { recursive: true })

const scale = 3

const sprites = {
  'tree-1': deciduousTree(false),
  'tree-2': deciduousTree(true),
  'pine-1': pineTree(),
  'bush-1': bush(false),
  'bush-2': bush(true),
  'flowers-1': flowers()
}

for (const [name, grid] of Object.entries(sprites)) {
  const { width, height, rgba } = grid.scaleTo(scale)
  const png = encodePng(width, height, rgba)
  writeFileSync(join(outDir, `${name}.png`), png)
  console.log(`${name}.png  ${width}x${height}`)
}

console.log(`\nWrote ${Object.keys(sprites).length} foliage sprites to ${outDir}`)
