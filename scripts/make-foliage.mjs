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

// Warm palette — autumnal greens leaning gold, warm trunks. Several green
// families so different trees read as different species, not recolours.
const palette = {
  trunk: [120, 84, 52],
  trunkDark: [88, 58, 36],
  trunkLight: [146, 104, 66],
  shadow: [70, 92, 48],
  // Leaf ramps: [darkest (underside), mid, light, highlight].
  leafGreen: [
    [70, 104, 46],
    [104, 146, 58],
    [142, 178, 78],
    [176, 204, 104]
  ],
  leafWarm: [
    [96, 110, 44],
    [140, 150, 56],
    [184, 184, 80],
    [212, 200, 110]
  ],
  leafDeep: [
    [58, 92, 50],
    [86, 124, 60],
    [120, 158, 78],
    [156, 188, 100]
  ],
  bushDark: [86, 122, 52],
  bushMid: [124, 162, 68],
  bushLight: [160, 192, 92],
  flower: [228, 138, 96],
  flowerAlt: [232, 196, 110],
  flowerCool: [196, 156, 220],
  pine: [
    [48, 86, 52],
    [70, 112, 64],
    [98, 142, 78]
  ]
}

/**
 * A tiny seeded random in [0, 1), so each tree variant is distinct but stable.
 *
 * @param seed - The variant seed (mutated by reference via the returned fn).
 * @returns A function returning the next pseudo-random value.
 */
function rng(seed) {
  let state = seed * 9301 + 49297

  return () => {
    state = (state * 9301 + 49297) % 233280

    return state / 233280
  }
}

/**
 * A round-canopy broadleaf tree. Size, lean, leaf ramp and dappling vary by
 * seed, and the canopy is shaded dark→light top-down with a soft ground
 * shadow, so a row of them reads as a varied grove.
 *
 * @param seed - Variant seed.
 * @returns The grid.
 */
function broadleafTree(seed) {
  const random = rng(seed)
  const ramp = [palette.leafGreen, palette.leafWarm, palette.leafDeep][Math.floor(random() * 3)]

  // Size varies a lot: small saplings to big old trees.
  const radius = 5 + Math.floor(random() * 5) // 5..9
  const w = radius * 2 + 6
  const h = radius * 2 + radius + 12
  const g = new Grid(w, h)

  const cx = Math.floor(w / 2)
  const groundY = h - 1
  const trunkH = radius + 3 + Math.floor(random() * 3)
  const trunkW = radius >= 8 ? 4 : radius >= 6 ? 3 : 2
  const canopyCy = groundY - trunkH - radius + 2

  // Ground shadow ellipse.
  for (let x = -radius; x <= radius; x += 1) {
    if ((x * x) / (radius * radius) <= 1) {
      g.set(cx + x, groundY, palette.shadow)
      if (Math.abs(x) < radius - 1) {
        g.set(cx + x, groundY - 1, palette.shadow)
      }
    }
  }

  // Trunk with a light edge and dark side.
  const trunkX = cx - Math.floor(trunkW / 2)
  g.rect(trunkX, groundY - trunkH - 1, trunkW, trunkH, palette.trunk)
  g.rect(trunkX, groundY - trunkH - 1, 1, trunkH, palette.trunkDark)

  if (trunkW >= 3) {
    g.rect(trunkX + trunkW - 1, groundY - trunkH - 1, 1, trunkH, palette.trunkLight)
  }

  // Canopy: several overlapping lobes for an irregular silhouette.
  const lobes = 3 + Math.floor(random() * 3)

  for (let i = 0; i < lobes; i += 1) {
    const lx = cx + Math.round((random() - 0.5) * radius)
    const ly = canopyCy + Math.round((random() - 0.5) * radius * 0.7)
    const lr = radius - 1 - Math.floor(random() * 2)
    g.disc(lx, ly, lr, ramp[0])
  }

  // Vertical shade pass: lighter toward the top, darker underside.
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const c = g.px[y * w + x]

      if (c !== ramp[0]) {
        continue
      }

      const t = (canopyCy + radius - y) / (radius * 2) // 1 top .. 0 bottom
      const band = t > 0.62 ? 3 : t > 0.34 ? 2 : t > 0.12 ? 1 : 0
      g.set(x, y, ramp[band])
    }
  }

  // A few warm dapples in the lit upper half.
  const dapples = 4 + Math.floor(random() * 4)

  for (let i = 0; i < dapples; i += 1) {
    const dx = cx + Math.round((random() - 0.4) * radius)
    const dy = canopyCy - Math.floor(random() * radius * 0.7)

    if (g.px[dy * w + dx] !== null) {
      g.set(dx, dy, ramp[3])
    }
  }

  return g
}

/**
 * A conifer / pine. Height, tier count and width vary by seed.
 *
 * @param seed - Variant seed.
 * @returns The grid.
 */
function pineTree(seed) {
  const random = rng(seed)
  const tierCount = 3 + Math.floor(random() * 2) // 3..4
  const half = 5 + Math.floor(random() * 3) // 5..7
  const tierStep = 4 + Math.floor(random() * 2)

  const w = half * 2 + 4
  const h = tierCount * tierStep + 14
  const g = new Grid(w, h)
  const cx = Math.floor(w / 2)
  const groundY = h - 1
  const trunkH = 5 + Math.floor(random() * 3)

  // Ground shadow.
  for (let x = -half + 1; x <= half - 1; x += 1) {
    g.set(cx + x, groundY, palette.shadow)
  }

  g.rect(cx - 1, groundY - trunkH - 1, 2, trunkH, palette.trunkDark)

  const topY = groundY - trunkH - tierCount * tierStep - 4

  for (let tier = 0; tier < tierCount; tier += 1) {
    const cy = topY + tier * tierStep
    const tierHalf = Math.round(half * (0.55 + (tier / Math.max(1, tierCount - 1)) * 0.45))

    for (let row = 0; row < tierStep + 4; row += 1) {
      const width = Math.round((tierHalf * 2 + 1) * Math.min(1, row / (tierStep + 2)))
      const startX = cx - Math.floor(width / 2)

      for (let x = 0; x < width; x += 1) {
        // Light at the sunlit upper-left, dark on the lower-right underside.
        const edge = x < width * 0.4
        const band = row < 2 ? 2 : edge ? 1 : 0
        g.set(startX + x, cy + row, palette.pine[band])
      }
    }
  }

  return g
}

/**
 * A low round bush. Size, shape and optional blossoms vary by seed.
 *
 * @param seed - Variant seed.
 * @param flowering - Whether to dot it with blossoms.
 * @returns The grid.
 */
function bush(seed, flowering) {
  const random = rng(seed)
  const r = 4 + Math.floor(random() * 3) // 4..6
  const w = r * 2 + 6
  const h = r * 2 + 6
  const g = new Grid(w, h)
  const cx = Math.floor(w / 2)
  const groundY = h - 2

  // Shadow.
  for (let x = -r; x <= r; x += 1) {
    if ((x * x) / (r * r) <= 0.9) {
      g.set(cx + x, groundY + 1, palette.shadow)
    }
  }

  // Lumpy body from a few discs.
  const lumps = 2 + Math.floor(random() * 2)
  g.disc(cx, groundY - r + 1, r, palette.bushDark)

  for (let i = 0; i < lumps; i += 1) {
    const lx = cx + Math.round((random() - 0.5) * r)
    const ly = groundY - r + Math.round((random() - 0.5) * r * 0.6)
    g.disc(lx, ly, r - 1, palette.bushMid)
  }

  g.disc(cx - 1, groundY - r - 1, r - 2, palette.bushLight)

  if (flowering) {
    const blooms = 3 + Math.floor(random() * 3)
    const colors = [palette.flower, palette.flowerAlt, palette.flowerCool]

    for (let i = 0; i < blooms; i += 1) {
      const bx = cx + Math.round((random() - 0.5) * r * 1.4)
      const by = groundY - r + Math.round((random() - 0.5) * r)
      g.set(bx, by, colors[Math.floor(random() * colors.length)])
    }
  }

  return g
}

/**
 * A small flower cluster for ground dressing.
 *
 * @param seed - Variant seed.
 * @returns The grid.
 */
function flowers(seed) {
  const random = rng(seed)
  const g = new Grid(13, 11)

  // Foliage base.
  g.disc(6, 9, 3, palette.bushMid)
  g.disc(8, 9, 2, palette.bushDark)

  const colors = [palette.flower, palette.flowerAlt, palette.flowerCool]
  const blooms = 4 + Math.floor(random() * 3)

  for (let i = 0; i < blooms; i += 1) {
    const x = 2 + Math.floor(random() * 9)
    const y = 2 + Math.floor(random() * 5)
    const color = colors[Math.floor(random() * colors.length)]
    g.set(x, y, color)
    g.set(x, y - 1, color)
    g.set(x - 1, y, color)
    g.set(x + 1, y, color)
  }

  return g
}

mkdirSync(outDir, { recursive: true })

const scale = 3

// Generate several seeded variants of each so the world reads as varied rather
// than a repeating pattern.
const sprites = {}

for (let i = 1; i <= 6; i += 1) {
  sprites[`tree-${i}`] = broadleafTree(i * 7 + 3)
}

for (let i = 1; i <= 3; i += 1) {
  sprites[`pine-${i}`] = pineTree(i * 11 + 5)
}

for (let i = 1; i <= 3; i += 1) {
  sprites[`bush-${i}`] = bush(i * 5 + 2, i === 3)
}

for (let i = 1; i <= 2; i += 1) {
  sprites[`flowers-${i}`] = flowers(i * 13 + 4)
}

for (const [name, grid] of Object.entries(sprites)) {
  const { width, height, rgba } = grid.scaleTo(scale)
  const png = encodePng(width, height, rgba)
  writeFileSync(join(outDir, `${name}.png`), png)
  console.log(`${name}.png  ${width}x${height}`)
}

console.log(`\nWrote ${Object.keys(sprites).length} foliage sprites to ${outDir}`)
