/* 极简流式 ZIP 写入器 —— 只支持 STORE(不压缩)
 *
 * 为什么不压缩:局域网带宽不是瓶颈,压缩纯烧 CPU;而且 STORE 模式下"边收边写"不需要缓冲整个文件。
 * 为什么不用现成库:本项目零依赖(vanilla),STORE 模式的 ZIP 规范只有三个结构,手写比引依赖便宜。
 *
 * 流式关键:local header 要写 crc/size,但这两个值要等数据写完才知道。
 * 解法=标准的 data descriptor(flag bit 3):header 里先写 0,数据后补一段 descriptor。
 *
 * 内存策略:片段周期性折叠进 Blob。JS 堆最多持有 FOLD 字节,其余交给浏览器 Blob 存储
 * (超过阈值浏览器会自动 spill 到磁盘),避免几百 MB 的 ArrayBuffer 数组把标签页撑爆。
 *
 * 不支持 ZIP64(单文件/总量 >4GB)。调用方须自行限制总量——浏览器内存本就扛不住那个量级,
 * 与其实现 ZIP64 假装能行,不如让调用方走"保存到文件夹"(File System Access)那条真流式的路。
 */
(function () {
'use strict';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();
// 增量 CRC32:running 以 0 起步,内部按规范取反,收尾再取反
function crc32(running, buf) {
  let c = ~running >>> 0;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

// DOS 时间戳:1980 为纪元起点,早于它的时间钳到 1980-01-01(而非溢出成乱码)
// 注意用 == null 而非 ||:lastModified 合法地可以是 0(1970-01-01),那是"有值",不是"没传"
function dosStamp(ms) {
  const d = new Date(ms == null ? Date.now() : ms);
  const y = d.getFullYear();
  if (!isFinite(y) || y < 1980) return { time: 0, date: (1 << 5) | 1 };
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: (Math.min(y, 2107) - 1980) << 9 | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

const enc = new TextEncoder();
function u8(len) { return new Uint8Array(len); }
function put32(a, o, v) { a[o] = v & 255; a[o+1] = (v >>> 8) & 255; a[o+2] = (v >>> 16) & 255; a[o+3] = (v >>> 24) & 255; }
function put16(a, o, v) { a[o] = v & 255; a[o+1] = (v >>> 8) & 255; }

/* 文件名一律 UTF-8 + flag bit11。已实测:Python zipfile / libarchive(bsdtar) / macOS Finder
 * 的归档工具都能正确还原中文与 emoji 路径。唯一的例外是 macOS 自带的命令行 `unzip`
 * (Apple 改版 Info-ZIP 6.00, 2009):它不认 bit11,中文名显示为乱码且解压报 Illegal byte sequence。
 * 试过按规范补 Unicode Path Extra Field(0x7075) 兜它,实测无效(它连这个字段也不看),
 * 白占体积,已移除。那台机器上的绕法是 `ditto -x -k` 或 `bsdtar -xf`,与本文件无关。 */

const FOLD = 4 * 1024 * 1024;     // JS 堆里最多积压这么多,超过就折叠进 Blob

function ZipStore() {
  this.blob = new Blob([]);       // 已折叠部分
  this.parts = [];                // 待折叠片段
  this.pending = 0;
  this.offset = 0;                // 已写出的总字节(= 下一个 local header 的偏移)
  this.entries = [];              // 中央目录条目
  this.open = null;               // 当前正在写的条目
}
ZipStore.prototype._push = function (chunk) {
  this.parts.push(chunk);
  this.pending += chunk.byteLength !== undefined ? chunk.byteLength : chunk.size;
  this.offset += chunk.byteLength !== undefined ? chunk.byteLength : chunk.size;
  if (this.pending >= FOLD) this._fold();
};
ZipStore.prototype._fold = function () {
  if (!this.parts.length) return;
  this.blob = new Blob([this.blob, ...this.parts]);
  this.parts = []; this.pending = 0;
};

/* 开一个条目。返回 {write(u8), close()}。同一时刻只能开一个(顺序流式写) */
ZipStore.prototype.file = function (name, lastModified) {
  if (this.open) this.open.close();
  const nameBytes = enc.encode(name);
  const st = dosStamp(lastModified);
  const h = u8(30 + nameBytes.length);
  put32(h, 0, 0x04034b50);
  put16(h, 4, 20);            // version needed
  put16(h, 6, 0x0808);        // bit3=data descriptor(流式), bit11=UTF-8 文件名
  put16(h, 8, 0);             // method: 0 = store
  put16(h, 10, st.time); put16(h, 12, st.date);
  // crc / 压缩后大小 / 原始大小 都留 0,真值在 data descriptor 里补
  put16(h, 26, nameBytes.length);
  put16(h, 28, 0);            // extra len
  h.set(nameBytes, 30);

  const entry = { nameBytes, time: st.time, date: st.date, offset: this.offset, crc: 0, size: 0 };
  this._push(h);
  const self = this;
  const w = {
    write(chunk) {
      const b = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
      entry.crc = crc32(entry.crc, b);
      entry.size += b.length;
      self._push(b);
    },
    close() {
      if (self.open !== w) return;
      const d = u8(16);
      put32(d, 0, 0x08074b50);          // data descriptor 签名
      put32(d, 4, entry.crc);
      put32(d, 8, entry.size);          // compressed size (= 原始大小,STORE)
      put32(d, 12, entry.size);
      self._push(d);
      self.entries.push(entry);
      self.open = null;
    },
  };
  this.open = w;
  return w;
};

/* 收尾:写中央目录 + EOCD,返回完整 zip 的 Blob */
ZipStore.prototype.finish = function () {
  if (this.open) this.open.close();
  const cdStart = this.offset;
  for (const e of this.entries) {
    const c = u8(46 + e.nameBytes.length);
    put32(c, 0, 0x02014b50);
    put16(c, 4, 20); put16(c, 6, 20);
    put16(c, 8, 0x0808); put16(c, 10, 0);
    put16(c, 12, e.time); put16(c, 14, e.date);
    put32(c, 16, e.crc);
    put32(c, 20, e.size); put32(c, 24, e.size);
    put16(c, 28, e.nameBytes.length);
    put32(c, 42, e.offset);
    c.set(e.nameBytes, 46);
    this._push(c);
  }
  const eocd = u8(22);
  put32(eocd, 0, 0x06054b50);
  put16(eocd, 8, this.entries.length);
  put16(eocd, 10, this.entries.length);
  put32(eocd, 12, this.offset - cdStart);
  put32(eocd, 16, cdStart);
  this._push(eocd);
  this._fold();
  return new Blob([this.blob], { type: 'application/zip' });
};

window.ZipStore = ZipStore;
})();
