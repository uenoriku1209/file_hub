// 外部ライブラリなしで PNG / JPEG / GIF / BMP の縦横サイズを読む

export interface ImageInfo {
  width: number
  height: number
  type: 'png' | 'jpg' | 'gif' | 'bmp'
}

export function readImageInfo(buf: Buffer): ImageInfo | null {
  // PNG
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), type: 'png' }
  }
  // GIF
  if (buf.length > 10 && buf.toString('ascii', 0, 3) === 'GIF') {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8), type: 'gif' }
  }
  // BMP
  if (buf.length > 26 && buf.toString('ascii', 0, 2) === 'BM') {
    return { width: buf.readInt32LE(18), height: Math.abs(buf.readInt32LE(22)), type: 'bmp' }
  }
  // JPEG
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++
        continue
      }
      const marker = buf[i + 1]
      // SOF0..SOF15 (DHT/JPG/DAC を除く)
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7), type: 'jpg' }
      }
      const len = buf.readUInt16BE(i + 2)
      i += 2 + len
    }
    return { width: 800, height: 600, type: 'jpg' }
  }
  return null
}

/** 最大幅/高さに収まるように縮小したサイズ */
export function fit(w: number, h: number, maxW: number, maxH = Infinity): { w: number; h: number } {
  const r = Math.min(1, maxW / w, maxH / h)
  return { w: Math.round(w * r), h: Math.round(h * r) }
}
