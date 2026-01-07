import { describe, expect, it } from 'vitest';
import { extractRunMessages } from '../src/middleware/websocketHandler';

type PackstreamComponents = {
  Packer: new (channel: { write: (chunk: Buffer) => void }) => {
    packable: (value: unknown) => () => void;
  };
  Structure: new (signature: number, fields: unknown[]) => unknown;
  Chunker: new (channel: { write: (chunk: Buffer) => void }, bufferSize?: number) => {
    write: (chunk: Buffer) => void;
    messageBoundary: () => void;
    flush: () => void;
  };
};

function loadPackstreamComponents(): PackstreamComponents {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const packstream = require('neo4j-driver-bolt-connection/lib/packstream/packstream-v1');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const structure = require('neo4j-driver-bolt-connection/lib/packstream/structure');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const chunking = require('neo4j-driver-bolt-connection/lib/channel/chunking');
    const Packer = packstream.Packer ?? packstream.default?.Packer;
    const Structure = structure.Structure ?? structure.default;
    const Chunker = chunking.Chunker ?? chunking.default?.Chunker;
    if (!Packer || !Structure || !Chunker) {
      throw new Error('Missing packstream components.');
    }
    return { Packer, Structure, Chunker };
  } catch (err) {
    throw new Error(
      `Unable to load neo4j packstream components. Ensure neo4j-driver is installed. ${String(
        (err as Error).message || err
      )}`
    );
  }
}

function packRunMessage(query: string, params: Record<string, unknown>): Buffer {
  const { Packer, Structure, Chunker } = loadPackstreamComponents();
  const chunks: Buffer[] = [];
  const channel = {
    write: (chunk: Buffer) => {
      const anyChunk = chunk as unknown as { _buffer?: Buffer; _buffers?: Array<{ _buffer: Buffer }> };
      if (anyChunk?._buffer) {
        chunks.push(Buffer.from(anyChunk._buffer));
        return;
      }
      if (anyChunk?._buffers) {
        chunks.push(Buffer.concat(anyChunk._buffers.map(part => Buffer.from(part._buffer))));
        return;
      }
      chunks.push(Buffer.from(chunk));
    }
  };
  const chunker = new Chunker(channel);
  const packer = new Packer(chunker);
  const structure = new Structure(0x10, [query, params]);
  packer.packable(structure)();
  chunker.messageBoundary();
  chunker.flush();
  return Buffer.concat(chunks);
}

describe('extractRunMessages', () => {
  it('decodes a RUN message packed by the official driver', () => {
    const query = 'RETURN $x AS x';
    const params = { x: 123, name: 'neo' };
    const framed = packRunMessage(query, params);
    const runs = extractRunMessages(framed);
    expect(runs).toHaveLength(1);
    expect(runs[0].query).toBe(query);
    expect(runs[0].params).toEqual(params);
  });

  it('rejects partial frames', () => {
    const query = 'RETURN $x AS x';
    const params = { x: 123 };
    const framed = packRunMessage(query, params);
    const truncated = framed.subarray(0, framed.length - 1);
    const runs = extractRunMessages(truncated);
    expect(runs).toEqual([]);
  });

  it('rejects trailing bytes in a decoded struct', () => {
    const query = 'RETURN $x AS x';
    const params = { x: 123 };
    const message = packRunMessage(query, params);
    const originalSize = message.readUInt16BE(0);
    const header = Buffer.alloc(2);
    header.writeUInt16BE(originalSize + 1, 0);
    const framed = Buffer.concat([
      header,
      message.subarray(2, 2 + originalSize),
      Buffer.from([0xc0]),
      Buffer.alloc(2)
    ]);
    const runs = extractRunMessages(framed);
    expect(runs).toEqual([]);
  });
});
