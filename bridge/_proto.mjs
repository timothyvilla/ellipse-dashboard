// _proto.mjs
// ──────────────────────────────────────────────────────────────────
// Loads the official cTrader Open API .proto files (vendored in ./protos)
// with protobufjs and builds the two lookups the client needs:
//
//   • byName   — message class by name        (e.g. "ProtoOATraderReq")
//   • payloadOf — numeric payloadType by name  (e.g. 2121)
//   • nameOf    — message name by payloadType  (reverse, for decoding)
//
// Wire framing (Open API): every message travels inside a ProtoMessage
//   { payloadType:uint32, payload:bytes, clientMsgId:string }
// and each ProtoMessage is length-prefixed on the socket with a 4-byte
// big-endian length. encodeFrame/decodeFrame handle that outer layer.
// ──────────────────────────────────────────────────────────────────
import protobuf from 'protobufjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROTO_DIR = join(__dirname, 'protos');

const root = new protobuf.Root();
// Resolve imports (OpenApiMessages imports the model/common files) from ./protos.
root.resolvePath = (_origin, target) => join(PROTO_DIR, target.replace(/^.*[\\/]/, ''));

await root.load(
  ['OpenApiCommonMessages.proto', 'OpenApiMessages.proto'].map((f) => join(PROTO_DIR, f)),
  { keepCase: true }
);

export const ProtoMessage = root.lookupType('ProtoMessage');
const ProtoHeartbeatEvent = root.lookupType('ProtoHeartbeatEvent');

// Build payloadType <-> message-name maps from the two payload-type enums.
// Each *Req/*Res/*Event message declares its payloadType via a default on
// field 1, so we read the enum values directly and pair them to messages by
// naming convention (PROTO_OA_TRADER_REQ -> ProtoOATraderReq, etc.).
const enums = ['ProtoPayloadType', 'ProtoOAPayloadType'].map((n) => root.lookupEnum(n).values);

export const payloadOf = {};   // messageName -> numeric payloadType
export const nameOf = {};      // numeric payloadType -> messageName

function enumToPascal(enumName) {
  // PROTO_OA_TRADER_REQ -> ProtoOATraderReq ; HEARTBEAT_EVENT -> ProtoHeartbeatEvent
  return enumName
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('')
    .replace(/^ProtoOa/, 'ProtoOA')     // ProtoOa... -> ProtoOA...
    .replace(/Pnl/, 'PnL')              // ...UnrealizedPnl -> ...UnrealizedPnL
    .replace(/^Proto([A-Z])/, 'Proto$1');
}

for (const table of enums) {
  for (const [enumName, value] of Object.entries(table)) {
    let msgName = enumToPascal(enumName);
    let type;
    try { type = root.lookupType(msgName); } catch { type = null; }
    if (!type) continue;
    payloadOf[msgName] = value;
    nameOf[value] = msgName;
  }
}

// Some messages don't follow the strict enum->PascalCase convention (e.g. the
// enum says ACCOUNTS but the message is named AccountList). Pin every type the
// bridge relies on explicitly so a convention miss can never silently drop one.
const PINS = {
  51: 'ProtoHeartbeatEvent',
  50: 'ProtoErrorRes',
  2142: 'ProtoOAErrorRes',
  2149: 'ProtoOAGetAccountListByAccessTokenReq',
  2150: 'ProtoOAGetAccountListByAccessTokenRes',
  2147: 'ProtoOAAccountsTokenInvalidatedEvent',
  2148: 'ProtoOAClientDisconnectEvent',
  2164: 'ProtoOAAccountDisconnectEvent',
};
for (const [pt, msgName] of Object.entries(PINS)) {
  try {
    root.lookupType(msgName);           // throws if the name is wrong -> loud failure at load
    payloadOf[msgName] = Number(pt);
    nameOf[Number(pt)] = msgName;
  } catch (e) {
    throw new Error(`proto pin failed for ${msgName} (payloadType ${pt}): ${e.message}`);
  }
}

export function lookup(name) {
  return root.lookupType(name);
}

/** Build a ProtoMessage buffer for {name}, wrapped with the 4-byte length prefix. */
export function encodeFrame(name, payloadObj = {}, clientMsgId) {
  const payloadType = payloadOf[name];
  if (payloadType == null) throw new Error(`Unknown message name: ${name}`);
  const inner = name === 'ProtoHeartbeatEvent'
    ? ProtoHeartbeatEvent.encode({}).finish()
    : root.lookupType(name).encode(payloadObj).finish();
  const wrapper = ProtoMessage.encode({ payloadType, payload: inner, clientMsgId }).finish();
  const framed = Buffer.allocUnsafe(4 + wrapper.length);
  framed.writeUInt32BE(wrapper.length, 0);
  Buffer.from(wrapper).copy(framed, 4);
  return framed;
}

/** Decode one ProtoMessage wrapper (already unframed) into {payloadType,name,clientMsgId,message}. */
export function decodeMessage(wrapperBuf) {
  const pm = ProtoMessage.decode(wrapperBuf);
  const name = nameOf[pm.payloadType];
  let message = null;
  if (name && pm.payload && pm.payload.length) {
    try { message = root.lookupType(name).decode(pm.payload); } catch { message = null; }
  }
  return { payloadType: pm.payloadType, name: name || `#${pm.payloadType}`, clientMsgId: pm.clientMsgId, message };
}
