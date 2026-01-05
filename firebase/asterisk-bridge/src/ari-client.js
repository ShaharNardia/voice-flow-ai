/**
 * Asterisk ARI Client
 * 
 * Handles connection to Asterisk's REST Interface for call control.
 */

const AriClient = require('ari-client');

let client = null;
let connected = false;

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
  hangupChannel,
  getChannel,
  startRecording,
};

