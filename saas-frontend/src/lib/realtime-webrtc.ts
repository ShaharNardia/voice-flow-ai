// Browser WebRTC client for OpenAI Realtime.
// The backend mints an ephemeral key (valid ~60s), we use it here to open
// a direct peer connection to api.openai.com. No server in the audio path.

export interface RealtimeEvent {
  type: string;
  [key: string]: unknown;
}

export interface RealtimeConnection {
  pc: RTCPeerConnection;
  dc: RTCDataChannel;
  mic: MediaStream;
  audioEl: HTMLAudioElement;
  sendEvent: (evt: RealtimeEvent) => void;
  stop: () => void;
}

interface ConnectOpts {
  ephemeralKey: string;               // client_secret.value from tutorCreateSession
  model?: string;                     // default gpt-4o-realtime-preview
  onEvent: (evt: RealtimeEvent) => void;
  onAudioEl?: (el: HTMLAudioElement) => void;
  onStateChange?: (state: RTCPeerConnectionState) => void;
}

export async function connectRealtime(opts: ConnectOpts): Promise<RealtimeConnection> {
  const model = opts.model || "gpt-4o-realtime-preview-2024-12-17";

  const pc = new RTCPeerConnection();

  // Remote audio from the model → play through an autoplay <audio> element.
  // Must be attached to the DOM — detached elements are suspended on iOS/Android.
  const audioEl = document.createElement("audio");
  audioEl.autoplay = true;
  audioEl.controls = false;
  audioEl.setAttribute("playsinline", "true"); // iOS: prevent fullscreen takeover
  audioEl.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;";
  document.body.appendChild(audioEl);
  pc.ontrack = (e) => {
    audioEl.srcObject = e.streams[0];
    // Resume playback if the browser suspended it (common on mobile after bg/fg transitions)
    audioEl.play().catch(() => {});
    opts.onAudioEl?.(audioEl);
  };

  // Student's mic — request mono 24 kHz to match OpenAI's expected format and
  // reduce stereo noise pickup. The browser honours these as hints; it will
  // fall back gracefully if the device doesn't support them.
  const mic = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,     // mono — reduces ambient noise vs stereo
      sampleRate: 24000,   // matches OpenAI Realtime's preferred sample rate
    },
  });
  pc.addTrack(mic.getAudioTracks()[0], mic);

  // Control + transcript channel.
  const dc = pc.createDataChannel("oai-events");
  dc.onmessage = (e) => {
    try {
      const evt = JSON.parse(e.data);
      opts.onEvent(evt);
    } catch {
      // ignore malformed
    }
  };

  if (opts.onStateChange) {
    pc.onconnectionstatechange = () => opts.onStateChange?.(pc.connectionState);
  }

  // SDP offer/answer handshake directly with OpenAI.
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  const resp = await fetch(`https://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`, {
    method: "POST",
    body: offer.sdp,
    headers: {
      Authorization: `Bearer ${opts.ephemeralKey}`,
      "Content-Type": "application/sdp",
    },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    pc.close();
    mic.getTracks().forEach((t) => t.stop());
    throw new Error(`OpenAI SDP exchange failed: ${resp.status} ${text.slice(0, 200)}`);
  }
  const answerSdp = await resp.text();
  await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

  const sendEvent = (evt: RealtimeEvent) => {
    if (dc.readyState === "open") dc.send(JSON.stringify(evt));
  };

  // Wait for the data channel to be open before resolving — the SDP exchange
  // above completes the signalling but DTLS + ICE can still be in progress.
  // Callers that need to sendEvent immediately after connect (e.g. response.create
  // for listen-only mode) depend on the channel being ready.
  //
  // IMPORTANT: attach listeners BEFORE the readyState guard check to avoid a
  // race where the "open" event fires in the tiny window between the check and
  // addEventListener — which would leave us waiting 15 s for a channel that is
  // already open.
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Data channel open timeout (15s)")),
      15000
    );
    dc.addEventListener("open", () => { clearTimeout(timeout); resolve(); });
    pc.addEventListener("connectionstatechange", () => {
      if (pc.connectionState === "failed") {
        clearTimeout(timeout);
        reject(new Error("Peer connection failed before data channel opened"));
      }
    });
    // Check after attaching listeners so we don't miss an already-open channel.
    if (dc.readyState === "open") { clearTimeout(timeout); resolve(); }
  });

  const stop = () => {
    try { dc.close(); } catch {}
    try { pc.close(); } catch {}
    mic.getTracks().forEach((t) => t.stop());
    audioEl.srcObject = null;
    try { audioEl.parentNode?.removeChild(audioEl); } catch {}
  };

  return { pc, dc, mic, audioEl, sendEvent, stop };
}
