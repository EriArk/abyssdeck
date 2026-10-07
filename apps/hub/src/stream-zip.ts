import { crc32 } from "node:zlib";

export interface ZipEntry {
  name: string;
  content: () => AsyncIterable<Uint8Array>;
}
/** Stored ZIP64, streamed with backpressure. Neither file size nor archive size is buffered. */
export async function* streamZip(entries: Iterable<ZipEntry>): AsyncGenerator<Buffer> {
  let offset = 0n;
  const directory: Buffer[] = [];
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const start = offset;
    const header = Buffer.alloc(30 + name.length + 20);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(45, 4);
    header.writeUInt16LE(0x0808, 6);
    header.writeUInt16LE(33, 12);
    header.writeUInt32LE(0xffffffff, 18);
    header.writeUInt32LE(0xffffffff, 22);
    header.writeUInt16LE(name.length, 26);
    header.writeUInt16LE(20, 28);
    name.copy(header, 30);
    header.writeUInt16LE(1, 30 + name.length);
    header.writeUInt16LE(16, 32 + name.length);
    yield header;
    offset += BigInt(header.length);
    let size = 0n,
      crc = 0;
    for await (const chunk of entry.content()) {
      const bytes = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      crc = crc32(bytes, crc);
      size += BigInt(bytes.length);
      offset += BigInt(bytes.length);
      yield bytes;
    }
    const descriptor = Buffer.alloc(24);
    descriptor.writeUInt32LE(0x08074b50);
    descriptor.writeUInt32LE(crc, 4);
    descriptor.writeBigUInt64LE(size, 8);
    descriptor.writeBigUInt64LE(size, 16);
    yield descriptor;
    offset += 24n;
    const central = Buffer.alloc(46 + name.length + 28);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(45, 4);
    central.writeUInt16LE(45, 6);
    central.writeUInt16LE(0x0808, 8);
    central.writeUInt16LE(33, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(0xffffffff, 20);
    central.writeUInt32LE(0xffffffff, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(28, 30);
    central.writeUInt32LE(0xffffffff, 42);
    name.copy(central, 46);
    const at = 46 + name.length;
    central.writeUInt16LE(1, at);
    central.writeUInt16LE(24, at + 2);
    central.writeBigUInt64LE(size, at + 4);
    central.writeBigUInt64LE(size, at + 12);
    central.writeBigUInt64LE(start, at + 20);
    directory.push(central);
  }
  const directoryStart = offset;
  for (const entry of directory) {
    yield entry;
    offset += BigInt(entry.length);
  }
  const end = Buffer.alloc(98),
    count = BigInt(directory.length);
  end.writeUInt32LE(0x06064b50);
  end.writeBigUInt64LE(44n, 4);
  end.writeUInt16LE(45, 12);
  end.writeUInt16LE(45, 14);
  end.writeBigUInt64LE(count, 24);
  end.writeBigUInt64LE(count, 32);
  end.writeBigUInt64LE(offset - directoryStart, 40);
  end.writeBigUInt64LE(directoryStart, 48);
  end.writeUInt32LE(0x07064b50, 56);
  end.writeBigUInt64LE(offset, 64);
  end.writeUInt32LE(1, 72);
  end.writeUInt32LE(0x06054b50, 76);
  end.writeUInt16LE(0xffff, 84);
  end.writeUInt16LE(0xffff, 86);
  end.writeUInt32LE(0xffffffff, 88);
  end.writeUInt32LE(0xffffffff, 92);
  yield end;
}
