/**
 * Asterisk ARI Client
 * 
 * Handles connection to Asterisk's REST Interface for call control.
 */

const AriClient    = require('ari-client');
const EventEmitter = require('events');

let client    = null;
let connected = false;

// Internal event bus for promise-based ARI event waiting
const emitter = new EventEmitter();
emitter.setMaxListeners(200);

const config = {
  host: process.env.ASTERISK_HOST || 'localhost',
  port: process.env.ASTERISK_ARI_PORT || 8088,
  user: process.env.ASTERISK_ARI_USER || 'voiceflow',
  password: process.env.ASTERISK_ARI_PASSWORD || '',
  app: process.env.ASTERISK_ARI_APP || 'voiceflow-bridge',
};

/**
 * Connect to Asterisk ARI
 */
async function connect() {
  const url = `http://${config.host}:${config.port}`;
  
  return new Promise((resolve, reject) => {
    AriClient.connect(url, config.user, config.password)
      .then((ariClient) => {
        client = ariClient;
        connected = true;
        
        // Start the Stasis application
        client.start(config.app);
        
        // Set up event handlers
        setupEventHandlers(client);
        
        console.log(`Connected to Asterisk ARI at ${url}`);
        resolve(client);
      })
      .catch((err) => {
        connected = false;
        console.error('ARI connection failed:', err.message);
        reject(err);
      });
  });
}

/**
 * Set up ARI event handlers
 */
function setupEventHandlers(ari) {
  ari.on('StasisStart', (event, channel) => {
    console.log(`StasisStart: ${channel.id} - ${channel.name}`);
  });

  ari.on('StasisEnd', (event, channel) => {
    console.log(`StasisEnd: ${channel.id}`);
  });

  ari.on('ChannelStateChange', (event, channel) => {
    console.log(`ChannelStateChange: ${channel.id} -> ${channel.state}`);
  });

  ari.on('ChannelDtmfReceived', (event, channel) => {
    console.log(`DTMF: ${event.digit} on ${channel.id}`);
  });

  ari.on('PlaybackFinished', (event, playback) => {
    console.log(`PlaybackFinished: ${playback.id}`);
    emitter.emit(`playback:${playback.id}:finished`);
  });

  ari.on('RecordingFinished', (event, recording) => {
    console.log(`RecordingFinished: ${recording.name}`);
    emitter.emit(`recording:${recording.name}:finished`, recording);
  });

  ari.on('RecordingFailed', (event, recording) => {
    console.warn(`RecordingFailed: ${recording.name} — ${recording.cause}`);
    emitter.emit(`recording:${recording.name}:failed`, recording);
  });
}

/**
 * Originate an outbound call
 */
async function originateCall(options) {
  if (!client || !connected) {
    throw new Error('ARI client not connected');
  }

  const {
    endpoint,
    callerId,
    variables = {},
    app = config.app,
    appArgs = '',
  } = options;

  return new Promise((resolve, reject) => {
    client.channels.originate({
      endpoint,
      app,
      appArgs,
      callerId,
      timeout: 30,
      variables: {
        ...variables,
      },
    }, (err, channel) => {
      if (err) {
        console.error('Originate failed:', err);
        reject(err);
      } else {
        console.log(`Call originated: ${channel.id}`);
        resolve(channel);
      }
    });
  });
}

/**
 * Answer a channel
 */
async function answerChannel(channelId) {
  if (!client) throw new Error('ARI client not connected');

  return new Promise((resolve, reject) => {
    client.channels.answer({ channelId }, (err) => {
      if (err) {
        reject(err);
      } else {
        console.log(`Channel answered: ${channelId}`);
        resolve();
      }
    });
  });
}

/**
 * Play a sound on a channel
 * @param {string} channelId - Channel ID
 * @param {string} media - Sound file path or 'sound:filename'
 */
async function playSound(channelId, media) {
  if (!client) throw new Error('ARI client not connected');

  // If it's not already prefixed, add 'sound:' or 'file:'
  let mediaUri = media;
  if (!media.startsWith('sound:') && !media.startsWith('file:') && !media.startsWith('http:')) {
    // Assume it's a file path
    mediaUri = `sound:${media}`;
  }

  return new Promise((resolve, reject) => {
    client.channels.play({
      channelId,
      media: mediaUri,
    }, (err, playback) => {
      if (err) {
        console.error(`Play failed on ${channelId}:`, err);
        reject(err);
      } else {
        console.log(`Playing ${mediaUri} on ${channelId}`);
        resolve(playback);
      }
    });
  });
}

/**
 * Hangup a channel
 */
async function hangupChannel(channelId, reason = 'normal') {
  if (!client) throw new Error('ARI client not connected');

  return new Promise((resolve, reject) => {
    client.channels.hangup({
      channelId,
      reason,
    }, (err) => {
      if (err) {
        // Channel might already be gone
        console.log(`Hangup note for ${channelId}:`, err.message);
        resolve();
      } else {
        console.log(`Channel hangup: ${channelId}`);
        resolve();
      }
    });
  });
}

/**
 * Get channel info
 */
async function getChannel(channelId) {
  if (!client) throw new Error('ARI client not connected');

  return new Promise((resolve, reject) => {
    client.channels.get({ channelId }, (err, channel) => {
      if (err) {
        reject(err);
      } else {
        resolve(channel);
      }
    });
  });
}

/**
 * Start recording on a channel
 */
async function startRecording(channelId, name) {
  if (!client) throw new Error('ARI client not connected');

  return new Promise((resolve, reject) => {
    client.channels.record({
      channelId,
      name,
      format: 'wav',
      maxDurationSeconds: 60,
      beep: false,
    }, (err, recording) => {
      if (err) {
        reject(err);
      } else {
        resolve(recording);
      }
    });
  });
}

/**
 * Play a sound and wait for playback to finish
 */
async function playAndWait(channelId, media) {
  if (!client) throw new Error('ARI client not connected');

  let mediaUri = media;
  if (!media.startsWith('sound:') && !media.startsWith('file:') && !media.startsWith('http:')) {
    mediaUri = `sound:${media}`;
  }

  return new Promise((resolve, reject) => {
    client.channels.play({ channelId, media: mediaUri }, (err, playback) => {
      if (err) return reject(err);

      const tid = setTimeout(() => {
        emitter.removeAllListeners(`playback:${playback.id}:finished`);
        resolve();  // timeout fallback — don't hang forever
      }, 120000);

      emitter.once(`playback:${playback.id}:finished`, () => {
        clearTimeout(tid);
        resolve();
      });
    });
  });
}

/**
 * Record speech on a channel with silence-based VAD stop.
 * Resolves when Asterisk fires RecordingFinished (silence detected or max duration).
 */
async function recordWithVAD(channelId, name, maxSilenceSeconds = 3) {
  if (!client) throw new Error('ARI client not connected');

  return new Promise((resolve, reject) => {
    client.channels.record({
      channelId,
      name,
      format: 'wav',
      maxDurationSeconds:  60,
      maxSilenceSeconds,
      beep:      false,
      ifExists:  'overwrite',
    }, (err, recording) => {
      if (err) return reject(err);

      const tid = setTimeout(() => {
        emitter.removeAllListeners(`recording:${name}:finished`);
        emitter.removeAllListeners(`recording:${name}:failed`);
        resolve(recording);  // timeout fallback
      }, (maxSilenceSeconds + 65) * 1000);

      emitter.once(`recording:${name}:finished`, (rec) => {
        clearTimeout(tid);
        resolve(rec);
      });

      emitter.once(`recording:${name}:failed`, (rec) => {
        clearTimeout(tid);
        reject(new Error(`Recording failed: ${rec.cause || 'unknown'}`));
      });
    });
  });
}

/**
 * Check if connected
 */
function isConnected() {
  return connected;
}

/**
 * Disconnect from ARI
 */
async function disconnect() {
  if (client) {
    // ARI client doesn't have a built-in disconnect, just set flags
    connected = false;
    client = null;
    console.log('Disconnected from Asterisk ARI');
  }
}

module.exports = {
  connect,
  disconnect,
  isConnected,
  originateCall,
  answerChannel,
  playSound,
  playAndWait,
  recordWithVAD,
  hangupChannel,
  getChannel,
  startRecording,
};

