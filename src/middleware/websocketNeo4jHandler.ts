import WebSocket from 'ws';
import logger from '../utils/logger';
import { RequestContext } from '../localStorage';
import { INJECTED_BOLT_CREDENTIALS, INJECTED_BOLT_PRINCIPAL, INJECTED_BOLT_SCHEME, WS_TARGET_URL } from '../config/env';
import { constructRequestContext, extractUserCN } from '../utils/requestContextHelper';

const targetWs = WS_TARGET_URL;
import { runPolicy } from '../pep/policy-executor';
import { Next } from 'koa';

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

type PackValue = string | number | boolean | null | Buffer | PackValue[] | { [key: string]: PackValue };
type BoltStruct = { signature: number; fields: PackValue[] };
type RunMessage = { query: string; params: PackValue };

type PackstreamDecoder = {
  unpacker: {
    unpack: (buffer: { remaining: () => number }, hydrateStructure?: (structure: unknown) => unknown) => unknown;
  };
  Structure: new (signature: number, fields: PackValue[]) => { signature: number; fields: PackValue[] };
  ChannelBuffer: new (buffer: Buffer) => { remaining: () => number };
};

let packstreamDecoder: PackstreamDecoder | null = null;

function getPackstreamDecoder(): PackstreamDecoder {
  if (packstreamDecoder) {
    return packstreamDecoder;
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const packstream = require('neo4j-driver-bolt-connection/lib/packstream/packstream-v1');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const structure = require('neo4j-driver-bolt-connection/lib/packstream/structure');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const channelBuf = require('neo4j-driver-bolt-connection/lib/channel/channel-buf');
  const Unpacker = packstream.Unpacker ?? packstream.default?.Unpacker;
  const Structure = structure.Structure ?? structure.default;
  const ChannelBuffer = channelBuf.default;
  if (!Unpacker || !Structure || !ChannelBuffer) {
    throw new Error('Neo4j PackStream decoder is unavailable.');
  }
  packstreamDecoder = {
    unpacker: new Unpacker(true),
    Structure,
    ChannelBuffer
  };
  return packstreamDecoder;
}

function injectAuthIntoBoltBuffer(buffer: Buffer): Buffer | null {
  let offset = 0;
  let prefix: Buffer | null = null;
  if (buffer.length >= 20 && buffer.readUInt32BE(0) === 0x6060b017) {
    prefix = buffer.subarray(0, 20);
    offset = 20;
  }

  const messages: Buffer[] = [];
  let chunks: Buffer[] = [];
  let changed = false;

  while (offset + 2 <= buffer.length) {
    const size = buffer.readUInt16BE(offset);
    offset += 2;
    if (size === 0) {
      if (chunks.length) {
        const message = Buffer.concat(chunks);
        const replaced = replaceAuthInBoltMessage(message);
        messages.push(replaced ?? message);
        if (replaced) {
          changed = true;
        }
        chunks = [];
      }
      continue;
    }
    if (offset + size > buffer.length) {
      break;
    }
    chunks.push(buffer.subarray(offset, offset + size));
    offset += size;
  }

  if (!changed) {
    return null;
  }

  const framedMessages = messages.map(frameBoltMessage);
  const body = Buffer.concat(framedMessages);
  return prefix ? Buffer.concat([prefix, body]) : body;
}

function replaceAuthInBoltMessage(message: Buffer): Buffer | null {
  if (message.length < 2) {
    return null;
  }
  const marker = message[0];
  const signature = message[1];
  if ((marker & 0xf0) !== 0xb0 || signature !== 0x6a || (marker & 0x0f) !== 1) {
    return null;
  }

  const authMap: { [key: string]: PackValue } = {
    scheme: INJECTED_BOLT_SCHEME,
    principal: INJECTED_BOLT_PRINCIPAL,
    credentials: INJECTED_BOLT_CREDENTIALS
  };

  return encodeStruct(0x6a, [authMap]);
}

function frameBoltMessage(message: Buffer): Buffer {
  const sizeBuffer = Buffer.alloc(2);
  sizeBuffer.writeUInt16BE(message.length, 0);
  return Buffer.concat([sizeBuffer, message, Buffer.alloc(2)]);
}

function encodeStruct(signature: number, fields: PackValue[]): Buffer {
  const marker = 0xb0 + fields.length;
  const fieldBuffers = fields.map(encodeValue);
  return Buffer.concat([Buffer.from([marker, signature]), ...fieldBuffers]);
}

function encodeValue(value: PackValue): Buffer {
  if (value === null) {
    return Buffer.from([0xc0]);
  }
  if (typeof value === 'string') {
    return encodeString(value);
  }
  if (typeof value === 'boolean') {
    return Buffer.from([value ? 0xc3 : 0xc2]);
  }
  if (typeof value === 'number' && Number.isInteger(value)) {
    return encodeInteger(value);
  }
  if (Buffer.isBuffer(value)) {
    return encodeBytes(value);
  }
  if (Array.isArray(value)) {
    return encodeList(value);
  }
  if (value && typeof value === 'object') {
    return encodeMap(value as { [key: string]: PackValue });
  }
  return Buffer.from([0xc0]);
}

function encodeString(value: string): Buffer {
  const payload = Buffer.from(value, 'utf8');
  const length = payload.length;
  if (length < 16) {
    return Buffer.concat([Buffer.from([0x80 + length]), payload]);
  }
  if (length < 256) {
    return Buffer.concat([Buffer.from([0xd0, length]), payload]);
  }
  if (length < 65536) {
    const size = Buffer.alloc(2);
    size.writeUInt16BE(length, 0);
    return Buffer.concat([Buffer.from([0xd1]), size, payload]);
  }
  const size = Buffer.alloc(4);
  size.writeUInt32BE(length, 0);
  return Buffer.concat([Buffer.from([0xd2]), size, payload]);
}

function encodeInteger(value: number): Buffer {
  if (value >= -16 && value <= 127) {
    return Buffer.from([value & 0xff]);
  }
  if (value >= -128 && value <= 127) {
    return Buffer.from([0xc8, value & 0xff]);
  }
  if (value >= -32768 && value <= 32767) {
    const buffer = Buffer.alloc(3);
    buffer[0] = 0xc9;
    buffer.writeInt16BE(value, 1);
    return buffer;
  }
  if (value >= -2147483648 && value <= 2147483647) {
    const buffer = Buffer.alloc(5);
    buffer[0] = 0xca;
    buffer.writeInt32BE(value, 1);
    return buffer;
  }
  const buffer = Buffer.alloc(9);
  buffer[0] = 0xcb;
  buffer.writeBigInt64BE(BigInt(value), 1);
  return buffer;
}

function encodeBytes(value: Buffer): Buffer {
  const length = value.length;
  if (length < 256) {
    return Buffer.concat([Buffer.from([0xcc, length]), value]);
  }
  if (length < 65536) {
    const size = Buffer.alloc(2);
    size.writeUInt16BE(length, 0);
    return Buffer.concat([Buffer.from([0xcd]), size, value]);
  }
  const size = Buffer.alloc(4);
  size.writeUInt32BE(length, 0);
  return Buffer.concat([Buffer.from([0xce]), size, value]);
}

function encodeList(value: PackValue[]): Buffer {
  const length = value.length;
  const payload = Buffer.concat(value.map(encodeValue));
  if (length < 16) {
    return Buffer.concat([Buffer.from([0x90 + length]), payload]);
  }
  if (length < 256) {
    return Buffer.concat([Buffer.from([0xd4, length]), payload]);
  }
  if (length < 65536) {
    const size = Buffer.alloc(2);
    size.writeUInt16BE(length, 0);
    return Buffer.concat([Buffer.from([0xd5]), size, payload]);
  }
  const size = Buffer.alloc(4);
  size.writeUInt32BE(length, 0);
  return Buffer.concat([Buffer.from([0xd6]), size, payload]);
}

function encodeMap(value: { [key: string]: PackValue }): Buffer {
  const entries = Object.entries(value);
  const payload = Buffer.concat(entries.flatMap(([key, entryValue]) => [encodeString(key), encodeValue(entryValue)]));
  const length = entries.length;
  if (length < 16) {
    return Buffer.concat([Buffer.from([0xa0 + length]), payload]);
  }
  if (length < 256) {
    return Buffer.concat([Buffer.from([0xd8, length]), payload]);
  }
  if (length < 65536) {
    const size = Buffer.alloc(2);
    size.writeUInt16BE(length, 0);
    return Buffer.concat([Buffer.from([0xd9]), size, payload]);
  }
  const size = Buffer.alloc(4);
  size.writeUInt32BE(length, 0);
  return Buffer.concat([Buffer.from([0xda]), size, payload]);
}

function decodeStruct(buffer: Buffer): BoltStruct | null {
  try {
    const { unpacker, Structure, ChannelBuffer } = getPackstreamDecoder();
    const wrapped = new ChannelBuffer(buffer);
    const value = unpacker.unpack(wrapped);
    if (!(value instanceof Structure)) {
      return null;
    }
    if (wrapped.remaining() !== 0) {
      return null;
    }
    return { signature: value.signature, fields: value.fields };
  } catch {
    return null;
  }
}

function splitBoltMessages(buffer: Buffer): Buffer[] {
  let offset = 0;
  if (buffer.length >= 20 && buffer.readUInt32BE(0) === 0x6060b017) {
    offset = 20;
  }
  const messages: Buffer[] = [];
  let chunks: Buffer[] = [];
  let sawTerminator = false;
  while (offset + 2 <= buffer.length) {
    const size = buffer.readUInt16BE(offset);
    offset += 2;
    if (size === 0) {
      if (chunks.length) {
        messages.push(Buffer.concat(chunks));
        chunks = [];
      }
      sawTerminator = true;
      continue;
    }
    if (offset + size > buffer.length) {
      return [];
    }
    chunks.push(buffer.subarray(offset, offset + size));
    offset += size;
  }
  if (chunks.length || (!sawTerminator && messages.length)) {
    return [];
  }
  return messages;
}

export function extractRunMessages(buffer: Buffer): RunMessage[] {
  const messages = splitBoltMessages(buffer);
  const runs: RunMessage[] = [];
  for (const message of messages) {
    const struct = decodeStruct(message);
    if (!struct || struct.signature !== 0x10 || struct.fields.length < 2) {
      continue;
    }
    const query = struct.fields[0];
    if (typeof query !== 'string') {
      continue;
    }
    runs.push({ query, params: struct.fields[1] });
  }
  return runs;
}

function sanitizePackValue(value: PackValue): unknown {
  if (Buffer.isBuffer(value)) {
    return value.toString('hex');
  }
  if (Array.isArray(value)) {
    return value.map(item => sanitizePackValue(item));
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as { [key: string]: PackValue });
    return Object.fromEntries(entries.map(([key, entryValue]) => [key, sanitizePackValue(entryValue)]));
  }
  return value;
}

function logSocketEventInfo(context: RequestContext, message: string, event: string, status?: number) {
  logger.info({
    timestamp: new Date().toISOString(),
    reqId: context.reqId,
    status: status,
    event: event,
    path: context.path,
    user: context.user,
    policyName: context.policyName,
    message: message
  });
}

function logSocketEventDebug(context: RequestContext, message: string, event: string, status?: number) {
  logger.debug({
    timestamp: new Date().toISOString(),
    reqId: context.reqId,
    status: status,
    event: event,
    path: context.path,
    user: context.user,
    policyName: context.policyName,
    message: message
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function logSocketEventError(context: RequestContext, error: any, event: string, status?: number) {
  logger.error({
    timestamp: new Date().toISOString(),
    reqId: context.reqId,
    status: status,
    event: event,
    path: context.path,
    user: context.user,
    policyName: context.policyName,
    message: error?.message || error,
    stack: error?.stack
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function websocketNeo4jHandler(ctx: any, _next: Next | undefined) {
  const userCN = extractUserCN(ctx);
  let context: RequestContext | null = null;
  let isContextResolved = false;
  const contextPromise = (async () => {
    context = await constructRequestContext(ctx, userCN);
    context.isAllowed = (await runPolicy(context?.user?.authAttributes ?? '', ctx.path ?? '')) || false;
    isContextResolved = true;
    return context.isAllowed;
  })();

  const getContext = async (): Promise<RequestContext | null> => {
    if (isContextResolved) {
      return context;
    }
    await contextPromise;
    return context;
  };

  const getIsAllowed = async (): Promise<boolean> => {
    if (!isContextResolved) {
      await getContext();
    }
    return context?.isAllowed ?? false;
  };

  let boltAuthLogged = false;

  const target = new WebSocket(targetWs);

  contextPromise
    .then(isAllowed => {
      if (!isAllowed) {
        if (ctx.websocket.readyState === WebSocket.OPEN && context) {
          ctx.websocket.close();
          logSocketEventInfo(
            context,
            `WebSocket connection denied by policy ${context.policyName}`,
            'WS_CLOSE_TRIGGERED_BY_POLICY',
            403
          );
        }
        if (target.readyState === WebSocket.OPEN || target.readyState === WebSocket.CONNECTING) {
          target.terminate();
        }
      }
    })
    .catch(err => {
      logger.error('Error in context resolution:', err);
    });

  // Forward messages from client to target
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx.websocket.on('message', async (msg: any) => {
    const isAllowed = await getIsAllowed();
    if (!isAllowed) {
      if (context) {
        logSocketEventInfo(context, 'Message blocked - not authorized', 'WS_MESSAGE_BLOCKED', target.readyState);
      }
      if (ctx.websocket.readyState === WebSocket.OPEN) {
        ctx.websocket.close();
      }
      target.terminate();
      return;
    }

    let outboundMsg = msg;
    let injected = false;
    if (Buffer.isBuffer(msg)) {
      const runs = extractRunMessages(msg);
      for (const run of runs) {
        const sanitizedParams = sanitizePackValue(run.params);
        if (context) {
          logSocketEventInfo(
            context,
            JSON.stringify({ query: run.query, params: sanitizedParams }),
            'WS_BOLT_RUN_QUERY'
          );
        }
      }
      const injectedBuffer = injectAuthIntoBoltBuffer(msg);
      if (injectedBuffer) {
        outboundMsg = injectedBuffer;
        injected = true;
      }
    }
    if (injected && !boltAuthLogged) {
      boltAuthLogged = true;
      const assumedUser = context?.user?.cn ?? context?.user?.name ?? 'unknown';
      const authMessage = `Bolt auth injected scheme=${INJECTED_BOLT_SCHEME} principal=${INJECTED_BOLT_PRINCIPAL} credentials=present onBehalf=${assumedUser}`;
      if (context) {
        logSocketEventInfo(context, authMessage, 'WS_BOLT_AUTH');
      }
    }
    if (target.readyState === WebSocket.OPEN) {
      target.send(outboundMsg);
    } else {
      target.once('open', () => target.send(outboundMsg));
      if (context) {
        logSocketEventInfo(context, `WebSocket target has been created ${context.policyName}`, 'WS_OPEN_TARGET', target.readyState);
      }
    }
    if (context) {
      if (Buffer.isBuffer(outboundMsg)) {
        logSocketEventDebug(context, outboundMsg.toString('hex'), 'WS_MESSAGE_TO_TARGET', target.readyState);
      } else if (typeof outboundMsg === 'string') {
        logSocketEventDebug(context, outboundMsg, 'WS_MESSAGE_TO_TARGET', target.readyState);
      }
    }
  });

  // Forward messages from target to client
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  target.on('message', async (msg: any) => {
    await getContext();
    if (ctx.websocket.readyState === WebSocket.OPEN) {
      ctx.websocket.send(msg);
    }
    if (context) {
      if (Buffer.isBuffer(msg)) {
        logSocketEventDebug(context, msg.toString('hex'), 'WS_MESSAGE_TO_CLIENT', target.readyState);
      } else if (typeof msg === 'string') {
        logSocketEventDebug(context, msg, 'WS_MESSAGE_TO_CLIENT', target.readyState);
      }
    }
  });

  // Handle open events
  ctx.websocket.on('open', async () => {
    await getContext();
    if (context) {
      logSocketEventInfo(context, 'Opened client WebSocket event', 'WS_OPEN_CLIENT', ctx.websocket.readyState);
    }
  });

  target.on('open', async () => {
    await getContext();
    if (context) {
      logSocketEventInfo(context, 'Opened target WebSocket event', 'WS_OPEN_TARGET', target.readyState);
    }
  });

  // Handle close events
  ctx.websocket.on('close', async () => {
    await getContext();
    if (context) {
      logSocketEventInfo(context, 'Closed client WebSocket event', 'WS_CLOSE_CLIENT', ctx.websocket.readyState);
    }
    target.close();
  });

  target.on('close', async () => {
    await getContext();
    if (context) {
      logSocketEventInfo(context, 'Closed target WebSocket event', 'WS_CLOSE_TARGET', target.readyState);
    }
    ctx.websocket.close();
  });

  // Handle errors
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx.websocket.on('error', async (err: any) => {
    await getContext();
    if (context) {
      logSocketEventError(context, err, 'WS_ERROR_CLIENT');
    }
    target.terminate();
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  target.on('error', async (err: any) => {
    await getContext();
    if (context) {
      logSocketEventError(context, err, 'WS_ERROR_TARGET');
    }
    ctx.websocket.terminate();
  });
}
