// _client.mjs
// ──────────────────────────────────────────────────────────────────
// Thin cTrader Open API socket client.
//   • Opens a TLS socket to {host}:5035 (live.ctraderapi.com / demo.ctraderapi.com).
//   • Reassembles the 4-byte-length-prefixed ProtoMessage frames.
//   • send(name, payload) returns a Promise resolved by matching clientMsgId,
//     or rejected on a ProtoOAErrorRes / ProtoErrorRes carrying the same id.
//   • Emits push events (spot events, disconnects, token-invalidated) to onEvent.
//   • Sends ProtoHeartbeatEvent every ~10s so the proxy keeps the socket open.
//
// It does NOT know anything about accounts or business logic — bridge.mjs drives it.
// Read-only by construction: this client never sends order/close messages.
// ──────────────────────────────────────────────────────────────────
import tls from 'node:tls';
import { randomUUID } from 'node:crypto';
import { encodeFrame, decodeMessage } from './_proto.mjs';

const HEARTBEAT_MS = 10_000;
const REQUEST_TIMEOUT_MS = 20_000;

export class CTraderClient {
  constructor({ host, port = 5035, onEvent = () => {}, log = console }) {
    this.host = host;
    this.port = port;
    this.onEvent = onEvent;
    this.log = log;
    this.socket = null;
    this._buf = Buffer.alloc(0);
    this._pending = new Map();       // clientMsgId -> {resolve,reject,timer}
    this._heartbeat = null;
    this._connected = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const socket = tls.connect({ host: this.host, port: this.port, servername: this.host }, () => {
        this._connected = true;
        this._heartbeat = setInterval(() => {
          try { this.socket.write(encodeFrame('ProtoHeartbeatEvent', {})); } catch {}
        }, HEARTBEAT_MS);
        this.log.info?.(`[ctrader] connected ${this.host}:${this.port}`);
        resolve();
      });
      socket.on('data', (chunk) => this._onData(chunk));
      socket.on('error', (err) => {
        if (!this._connected) reject(err);
        this._fail(err);
      });
      socket.on('close', () => {
        const err = new Error('socket closed');
        this._connected = false;
        this._fail(err);
        this.onEvent({ type: 'close' });
      });
      this.socket = socket;
    });
  }

  _onData(chunk) {
    this._buf = Buffer.concat([this._buf, chunk]);
    // Drain every complete 4-byte-length-prefixed frame currently buffered.
    while (this._buf.length >= 4) {
      const len = this._buf.readUInt32BE(0);
      if (this._buf.length < 4 + len) break;
      const wrapper = this._buf.subarray(4, 4 + len);
      this._buf = this._buf.subarray(4 + len);
      let decoded;
      try { decoded = decodeMessage(wrapper); } catch (e) { this.log.warn?.('[ctrader] decode failed', e.message); continue; }
      this._dispatch(decoded);
    }
  }

  _dispatch(decoded) {
    const { name, clientMsgId, message } = decoded;
    if (name === 'ProtoHeartbeatEvent') return;
    const waiter = clientMsgId && this._pending.get(clientMsgId);
    if (waiter) {
      this._pending.delete(clientMsgId);
      clearTimeout(waiter.timer);
      if (name === 'ProtoOAErrorRes' || name === 'ProtoErrorRes') {
        const code = message?.errorCode || 'ERROR';
        const desc = message?.description || '';
        waiter.reject(new Error(`${code}${desc ? ': ' + desc : ''}`));
      } else {
        waiter.resolve(decoded);
      }
      return;
    }
    // Unmatched -> a push event (spot tick, disconnect, token invalidated, execution).
    this.onEvent(decoded);
  }

  /** Send a request and await its correlated response. */
  send(name, payload = {}) {
    return new Promise((resolve, reject) => {
      if (!this._connected) return reject(new Error('not connected'));
      const clientMsgId = randomUUID();
      const timer = setTimeout(() => {
        this._pending.delete(clientMsgId);
        reject(new Error(`timeout waiting for response to ${name}`));
      }, REQUEST_TIMEOUT_MS);
      this._pending.set(clientMsgId, { resolve, reject, timer });
      try {
        this.socket.write(encodeFrame(name, payload, clientMsgId));
      } catch (e) {
        this._pending.delete(clientMsgId);
        clearTimeout(timer);
        reject(e);
      }
    });
  }

  /** Fire-and-forget (used for subscribe/heartbeat where we don't await). */
  fire(name, payload = {}) {
    this.socket.write(encodeFrame(name, payload));
  }

  _fail(err) {
    for (const [, w] of this._pending) { clearTimeout(w.timer); w.reject(err); }
    this._pending.clear();
    if (this._heartbeat) { clearInterval(this._heartbeat); this._heartbeat = null; }
  }

  close() {
    this._connected = false;
    if (this._heartbeat) { clearInterval(this._heartbeat); this._heartbeat = null; }
    try { this.socket?.end(); } catch {}
    try { this.socket?.destroy(); } catch {}
  }
}
