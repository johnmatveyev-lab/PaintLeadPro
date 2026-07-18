/**
 * chloe-voice.js — "Talk to Chloe" real-time voice agent for PaintLead Pro.
 *
 * Architecture (no server in the audio path):
 *   browser ──POST /api/voice-token──▶ Vercel fn ──▶ xAI client_secrets
 *   browser ◀──── 5-min ephemeral token ────┘
 *   browser ◀════ WebSocket wss://api.x.ai/v1/realtime (direct) ════▶ Grok
 *
 * Audio: PCM16 mono @ 24 kHz both directions (base64 in JSON events).
 * Auth:  ephemeral token via `xai-client-secret.<token>` WS subprotocol.
 * Tools: `submit_lead` function call → window.ChloeVoice.onLead(details)
 *        (homeowner.html maps this onto its existing Supabase lead flow).
 *
 * Zero dependencies. Drop-in: <script src="js/chloe-voice.js" defer></script>
 */
(function () {
  'use strict';

  const MODEL = 'grok-voice-latest';
  const WS_URL = 'wss://api.x.ai/v1/realtime?model=' + MODEL;
  const RATE = 24000;

  const INSTRUCTIONS = `You are Chloe, PaintLead Pro's friendly scheduling assistant for house-painting projects in the Greenville, South Carolina area.

Goals, in order:
1. Greet warmly, keep replies to 1-2 short sentences — this is a live voice call.
2. Learn the project: interior or exterior, rough size/scope, color ideas, timeline, budget range.
3. Get the homeowner's first name and mobile phone number, and street address if offered.
4. When you have at least name + phone + scope, call the submit_lead tool, then confirm: a certified local painting contractor will call to book their free on-site visit.

Rules: never quote exact prices (site visit determines pricing); if asked something unrelated to painting, answer in one sentence and steer back; never claim to be human.`;

  const TOOLS = [
    {
      type: 'function',
      name: 'submit_lead',
      description:
        'Submit a qualified homeowner painting lead once name, phone, and project scope are known.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Homeowner first/full name' },
          phone: { type: 'string', description: 'Mobile phone number' },
          address: { type: 'string', description: 'Street address, if given' },
          scope: { type: 'string', description: 'e.g. exterior siding, 2-story; interior 3 rooms' },
          budget: { type: 'string', description: 'Budget range, if given' },
          color: { type: 'string', description: 'Color preferences, if given' }
        },
        required: ['name', 'phone', 'scope']
      }
    }
  ];

  // ── State ────────────────────────────────────────────────────────
  let ws = null;
  let audioCtx = null;
  let micStream = null;
  let micNode = null;
  let srcNode = null;
  let playhead = 0; // schedule cursor for output audio
  let liveSources = [];
  let status = 'idle'; // idle | connecting | live | error | off
  let ui = {};

  // ── UI (floating pill button + status) ──────────────────────────────
  function buildUI() {
    const wrap = document.createElement('div');
    wrap.id = 'chloe-voice-widget';
    wrap.style.cssText =
      'position:fixed;right:16px;bottom:16px;z-index:9999;font-family:Inter,system-ui,sans-serif;display:flex;flex-direction:column;align-items:flex-end;gap:8px;';

    const caption = document.createElement('div');
    caption.style.cssText =
      'background:#0f172a;color:#e2e8f0;padding:8px 12px;border-radius:12px;font-size:12px;max-width:260px;box-shadow:0 8px 24px rgba(2,6,23,.35);display:none;line-height:1.4;';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Talk to Chloe, our voice assistant');
    btn.style.cssText =
      'display:flex;align-items:center;gap:10px;background:#0b2447;color:#fff;border:0;border-radius:999px;padding:12px 18px;cursor:pointer;box-shadow:0 10px 30px rgba(2,6,23,.4);font-weight:600;font-size:14px;min-height:48px;';
    btn.innerHTML =
      '<span style="display:inline-flex;width:22px;height:22px;border-radius:50%;background:#f59e0b;align-items:center;justify-content:center;flex:none;">' +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0b2447" stroke-width="3" stroke-linecap="round"><path d="M12 2v11"/><path d="M8 22h8"/><path d="M12 18v4"/><path d="M5 10v1a7 7 0 0 0 14 0v-1"/></svg>' +
      '</span><span data-label>Talk to Chloe</span>';
    btn.addEventListener('click', toggle);

    wrap.appendChild(caption);
    wrap.appendChild(btn);
    document.body.appendChild(wrap);
    ui = { wrap, btn, caption, label: btn.querySelector('[data-label]') };
  }

  function setStatus(next, text) {
    status = next;
    if (!ui.label) return;
    const labels = {
      idle: 'Talk to Chloe',
      connecting: 'Connecting…',
      live: 'Listening — tap to end',
      error: 'Voice unavailable',
      off: 'Voice coming soon'
    };
    ui.label.textContent = text || labels[next] || labels.idle;
    ui.btn.style.background = next === 'live' ? '#166534' : next === 'error' ? '#7f1d1d' : '#0b2447';
  }

  function showCaption(text) {
    if (!ui.caption) return;
    ui.caption.style.display = text ? 'block' : 'none';
    if (text) ui.caption.textContent = text;
  }

  // ── Audio: mic capture → PCM16 @ 24k ────────────────────────────────
  const WORKLET_SRC = `
    class ChloeCapture extends AudioWorkletProcessor {
      process(inputs) {
        const ch = inputs[0] && inputs[0][0];
        if (ch) this.port.postMessage(ch.slice(0));
        return true;
      }
    }
    registerProcessor('chloe-capture', ChloeCapture);
  `;

  function floatTo16(f32) {
    const out = new Int16Array(f32.length);
    for (let i = 0; i < f32.length; i++) {
      const s = Math.max(-1, Math.min(1, f32[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }

  function resample(f32, from, to) {
    if (from === to) return f32;
    const ratio = from / to;
    const n = Math.floor(f32.length / ratio);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const pos = i * ratio;
      const i0 = Math.floor(pos);
      const i1 = Math.min(i0 + 1, f32.length - 1);
      out[i] = f32[i0] + (f32[i1] - f32[i0]) * (pos - i0);
    }
    return out;
  }

  function b64FromInt16(i16) {
    const bytes = new Uint8Array(i16.buffer);
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
  }

  function int16FromB64(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Int16Array(bytes.buffer);
  }

  async function startMic() {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
    });
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const blob = new Blob([WORKLET_SRC], { type: 'application/javascript' });
    await audioCtx.audioWorklet.addModule(URL.createObjectURL(blob));
    srcNode = audioCtx.createMediaStreamSource(micStream);
    micNode = new AudioWorkletNode(audioCtx, 'chloe-capture');
    micNode.port.onmessage = (e) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const pcm = floatTo16(resample(e.data, audioCtx.sampleRate, RATE));
      ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: b64FromInt16(pcm) }));
    };
    srcNode.connect(micNode);
    // Not connected to destination — capture only, no monitoring feedback.
  }

  // ── Audio: playback queue @ 24k with barge-in ───────────────────────
  function playDelta(b64) {
    if (!audioCtx) return;
    const i16 = int16FromB64(b64);
    const f32 = new Float32Array(i16.length);
    for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 0x8000;
    const buf = audioCtx.createBuffer(1, f32.length, RATE);
    buf.getChannelData(0).set(f32);
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(audioCtx.destination);
    const t = Math.max(audioCtx.currentTime + 0.04, playhead);
    src.start(t);
    playhead = t + buf.duration;
    liveSources.push(src);
    src.onended = () => { liveSources = liveSources.filter((s) => s !== src); };
  }

  function stopPlayback() {
    liveSources.forEach((s) => { try { s.stop(); } catch (_) {} });
    liveSources = [];
    playhead = 0;
  }

  // ── Session ──────────────────────────────────────────────────────
  async function connect() {
    setStatus('connecting');
    let mint;
    try {
      const r = await fetch('/api/voice-token', { method: 'POST' });
      mint = await r.json();
      if (!r.ok) throw new Error(mint.error || 'mint failed');
    } catch (err) {
      console.error('[Chloe] token mint failed:', err);
      setStatus('error');
      showCaption('Voice is temporarily unavailable. Use the form below and we’ll call you.');
      return;
    }

    if (mint.mock) {
      setStatus('off');
      showCaption('Chloe’s voice line isn’t switched on in this environment yet.');
      return;
    }

    try {
      await startMic();
    } catch (err) {
      console.error('[Chloe] mic permission denied:', err);
      setStatus('error');
      showCaption('Microphone access is needed to talk to Chloe.');
      return;
    }

    // Browser auth: ephemeral token rides the WS subprotocol.
    ws = new WebSocket(WS_URL, ['xai-client-secret.' + mint.token]);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'session.update',
        session: {
          instructions: INSTRUCTIONS,
          voice: 'eve',
          audio: {
            input: { format: { type: 'audio/pcm', rate: RATE } },
            output: { format: { type: 'audio/pcm', rate: RATE } }
          },
          turn_detection: { type: 'server_vad' },
          tools: TOOLS
        }
      }));
      setStatus('live');
      showCaption('You’re live with Chloe — say hello and tell her about your project.');
      setTimeout(() => showCaption(''), 6000);
    };

    ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch (_) { return; }
      switch (msg.type) {
        case 'response.output_audio.delta':
        case 'response.audio.delta':
          if (msg.delta) playDelta(msg.delta);
          break;
        case 'input_audio_buffer.speech_started':
          stopPlayback(); // barge-in: user talks over Chloe
          break;
        case 'response.function_call_arguments.done':
          handleToolCall(msg);
          break;
        case 'error':
          console.error('[Chloe] server error:', msg.error || msg);
          break;
      }
    };

    ws.onerror = (e) => { console.error('[Chloe] ws error', e); };
    ws.onclose = () => { teardown(false); };
  }

  async function handleToolCall(msg) {
    let args = {};
    try { args = JSON.parse(msg.arguments || '{}'); } catch (_) {}
    let result = { ok: false };
    if (msg.name === 'submit_lead' || !msg.name) {
      try {
        const hook = (window.ChloeVoice && window.ChloeVoice.onLead) || defaultLeadHook;
        result = (await hook(args)) || { ok: true };
      } catch (err) {
        console.error('[Chloe] lead hook failed:', err);
        result = { ok: false, error: 'could not save lead' };
      }
    }
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: msg.call_id,
          output: JSON.stringify(result)
        }
      }));
      ws.send(JSON.stringify({ type: 'response.create' }));
    }
  }

  // Fallback if the host page doesn't wire its own lead handler:
  // reuse the existing dispatch endpoint (mock-safe server-side).
  async function defaultLeadHook(args) {
    const r = await fetch('/api/dispatch-lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: args.name || '',
        phone: args.phone || '',
        address: args.address || '',
        scope: args.scope || 'voice lead',
        budget: args.budget || '',
        color: args.color || ''
      })
    });
    return { ok: r.ok };
  }

  function teardown(closeWs) {
    if (closeWs && ws && ws.readyState === WebSocket.OPEN) ws.close();
    ws = null;
    stopPlayback();
    if (micNode) { try { micNode.disconnect(); } catch (_) {} micNode = null; }
    if (srcNode) { try { srcNode.disconnect(); } catch (_) {} srcNode = null; }
    if (micStream) { micStream.getTracks().forEach((t) => t.stop()); micStream = null; }
    if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null; }
    if (status !== 'error' && status !== 'off') setStatus('idle');
    showCaption('');
  }

  function toggle() {
    if (status === 'live' || status === 'connecting') teardown(true);
    else connect();
  }

  // ── Public hook + boot ───────────────────────────────────────────
  window.ChloeVoice = window.ChloeVoice || {};
  window.ChloeVoice.end = () => teardown(true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildUI);
  } else {
    buildUI();
  }
})();
