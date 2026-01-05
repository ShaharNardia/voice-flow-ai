/**
 * VoiceFlow Asterisk Bridge
 * 
 * This service connects VoiceFlow to Asterisk PBX using ARI (Asterisk REST Interface).
 * It handles outbound calls, TTS, and call flow management.
 * 
 * Deploy this on the same server as Asterisk or a server that can reach Asterisk.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const ariClient = require('./ari-client');
const ttsService = require('./tts-service');
const firebaseService = require('./firebase-service');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.BRIDGE_PORT || 3000;
const BRIDGE_SECRET = process.env.BRIDGE_SECRET || 'default-secret';

// Active calls tracking
const activeCalls = new Map();

/**
 * Middleware to verify API secret
 */
function verifySecret(req, res, next) {
  const secret = req.headers['x-bridge-secret'] || req.query.secret;
  if (secret !== BRIDGE_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    asteriskConnected: ariClient.isConnected(),
    activeCalls: activeCalls.size,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Place an outbound call
 * 
 * POST /call
 * Body: {
 *   leadNumber: "+972501234567",
 *   leadName: "John Doe",
 *   companyName: "Acme Inc",
 *   assistantName: "Sarah",
 *   greeting: "Hello {{clientName}}, this is {{assistantName}} from {{companyName}}...",
 *   callerId: "+972509876543",
 *   callSessionId: "firebase-session-id",
 *   metadata: { ... }
 * }
 */
app.post('/call', verifySecret, async (req, res) => {
  try {
    const {
      leadNumber,
      leadName,
      companyName,
      assistantName,
      greeting,
      callerId,
      callSessionId,
      metadata = {},
    } = req.body;

    if (!leadNumber) {
      return res.status(400).json({ error: 'leadNumber is required' });
    }

    const callId = uuidv4();
    const sipTrunk = process.env.SIP_TRUNK_NAME || 'partner-trunk';
    const callerIdNum = callerId || process.env.DEFAULT_CALLER_ID;

    // Replace placeholders in greeting
    const processedGreeting = replacePlaceholders(greeting || '', {
      leadName,
      assistantName,
      companyName,
    });

    // Generate TTS audio for greeting
    console.log(`[${callId}] Generating TTS for greeting...`);
    const audioFile = await ttsService.synthesize(processedGreeting, callId);

    // Store call info
    activeCalls.set(callId, {
      callId,
      callSessionId,
      leadNumber,
      leadName,
      companyName,
      assistantName,
      greeting: processedGreeting,
      audioFile,
      callerId: callerIdNum,
      metadata,
      status: 'initiating',
      createdAt: new Date(),
    });

    // Originate call via ARI
    console.log(`[${callId}] Originating call to ${leadNumber}...`);
    const channel = await ariClient.originateCall({
      endpoint: `PJSIP/${formatNumber(leadNumber)}@${sipTrunk}`,
      callerId: callerIdNum,
      variables: {
        VOICEFLOW_CALL_ID: callId,
        VOICEFLOW_SESSION_ID: callSessionId,
        VOICEFLOW_GREETING: audioFile,
      },
      app: process.env.ASTERISK_ARI_APP || 'voiceflow-bridge',
    });

    activeCalls.get(callId).channelId = channel.id;
    activeCalls.get(callId).status = 'dialing';

    // Update Firebase
    await firebaseService.updateCallSession(callSessionId, {
      status: 'dialing',
      asteriskCallId: callId,
      asteriskChannelId: channel.id,
    });

    res.status(201).json({
      status: 'initiated',
      callId,
      channelId: channel.id,
      callSessionId,
    });

  } catch (error) {
    console.error('Failed to place call:', error);
    res.status(500).json({ error: 'Failed to place call', details: error.message });
  }
});

/**
 * Get call status
 */
app.get('/call/:callId', verifySecret, (req, res) => {
  const call = activeCalls.get(req.params.callId);
  if (!call) {
    return res.status(404).json({ error: 'Call not found' });
  }
  res.json(call);
});

/**
 * Hangup a call
 */
app.post('/call/:callId/hangup', verifySecret, async (req, res) => {
  try {
    const call = activeCalls.get(req.params.callId);
    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    await ariClient.hangupChannel(call.channelId);
    call.status = 'hangup_requested';

    res.json({ status: 'hangup_requested', callId: call.callId });
  } catch (error) {
    console.error('Failed to hangup call:', error);
    res.status(500).json({ error: 'Failed to hangup', details: error.message });
  }
});

/**
 * Webhook for Asterisk events (called by ARI)
 */
app.post('/webhook/asterisk', async (req, res) => {
  try {
    const event = req.body;
    console.log('Asterisk event:', event.type, event);

    // Handle different event types
    switch (event.type) {
      case 'StasisStart':
        await handleStasisStart(event);
        break;
      case 'StasisEnd':
        await handleStasisEnd(event);
        break;
      case 'ChannelStateChange':
        await handleChannelStateChange(event);
        break;
      case 'ChannelDtmfReceived':
        await handleDtmfReceived(event);
        break;
      case 'PlaybackFinished':
        await handlePlaybackFinished(event);
        break;
    }

    res.status(200).end();
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).end();
  }
});

/**
 * Handle call answered
 */
async function handleStasisStart(event) {
  const channelId = event.channel?.id;
  const callId = event.channel?.channelvars?.VOICEFLOW_CALL_ID;
  
  if (!callId || !activeCalls.has(callId)) {
    console.log('Unknown call, ignoring');
    return;
  }

  const call = activeCalls.get(callId);
  call.status = 'answered';
  call.answeredAt = new Date();

  console.log(`[${callId}] Call answered, playing greeting...`);

  // Answer the channel
  await ariClient.answerChannel(channelId);

  // Play the greeting
  await ariClient.playSound(channelId, call.audioFile);
}

/**
 * Handle playback finished - start gathering input
 */
async function handlePlaybackFinished(event) {
  const channelId = event.playback?.target_uri?.replace('channel:', '');
  const call = Array.from(activeCalls.values()).find(c => c.channelId === channelId);
  
  if (!call) return;

  console.log(`[${call.callId}] Greeting finished, waiting for response...`);
  
  // Play prompt for response
  await ariClient.playSound(channelId, 'sound:beep');
  
  // Start recording for speech recognition (or wait for DTMF)
  call.status = 'gathering';
  
  // Set a timeout for response
  setTimeout(async () => {
    if (call.status === 'gathering') {
      console.log(`[${call.callId}] No response, scheduling callback...`);
      await handleNoResponse(call);
    }
  }, 10000); // 10 second timeout
}

/**
 * Handle DTMF input
 */
async function handleDtmfReceived(event) {
  const channelId = event.channel?.id;
  const digit = event.digit;
  const call = Array.from(activeCalls.values()).find(c => c.channelId === channelId);
  
  if (!call) return;

  console.log(`[${call.callId}] DTMF received: ${digit}`);
  call.dtmfInput = (call.dtmfInput || '') + digit;

  // Handle response based on digit
  if (digit === '1') {
    // Interested
    await handlePositiveResponse(call);
  } else if (digit === '2') {
    // Not interested
    await handleNegativeResponse(call);
  }
}

/**
 * Handle positive response
 */
async function handlePositiveResponse(call) {
  call.status = 'interested';
  call.leadStatus = 'interested';
  
  // Play confirmation message
  const confirmationAudio = await ttsService.synthesize(
    'Great! Thank you for your interest. One of our team members will call you back shortly. Have a wonderful day!',
    `${call.callId}-confirm`
  );
  
  await ariClient.playSound(call.channelId, confirmationAudio);
  
  // Update Firebase
  await firebaseService.updateCallSession(call.callSessionId, {
    status: 'completed',
    leadStatus: 'interested',
    callbackRequested: true,
  });
  
  await firebaseService.updateLead(call.metadata?.leadId, {
    callStatus: 'Interested',
    lastContactDate: new Date(),
  });
  
  // Hangup after message
  setTimeout(() => ariClient.hangupChannel(call.channelId), 5000);
}

/**
 * Handle negative response
 */
async function handleNegativeResponse(call) {
  call.status = 'not_interested';
  call.leadStatus = 'not_interested';
  
  const thankYouAudio = await ttsService.synthesize(
    'I understand. Thank you for your time. Have a great day!',
    `${call.callId}-thanks`
  );
  
  await ariClient.playSound(call.channelId, thankYouAudio);
  
  await firebaseService.updateCallSession(call.callSessionId, {
    status: 'completed',
    leadStatus: 'not_interested',
    callbackRequested: false,
  });
  
  await firebaseService.updateLead(call.metadata?.leadId, {
    callStatus: 'Not Interested',
    lastContactDate: new Date(),
  });
  
  setTimeout(() => ariClient.hangupChannel(call.channelId), 3000);
}

/**
 * Handle no response
 */
async function handleNoResponse(call) {
  call.status = 'no_response';
  
  const callbackAudio = await ttsService.synthesize(
    'No problem. We will contact you again soon. Have a great day!',
    `${call.callId}-callback`
  );
  
  await ariClient.playSound(call.channelId, callbackAudio);
  
  await firebaseService.updateCallSession(call.callSessionId, {
    status: 'completed',
    leadStatus: 'callback_requested',
    callbackRequested: true,
  });
  
  await firebaseService.updateLead(call.metadata?.leadId, {
    callStatus: 'Callback Requested',
    lastContactDate: new Date(),
  });
  
  setTimeout(() => ariClient.hangupChannel(call.channelId), 3000);
}

/**
 * Handle call ended
 */
async function handleStasisEnd(event) {
  const channelId = event.channel?.id;
  const call = Array.from(activeCalls.values()).find(c => c.channelId === channelId);
  
  if (!call) return;

  console.log(`[${call.callId}] Call ended`);
  call.status = 'completed';
  call.endedAt = new Date();
  call.duration = Math.round((call.endedAt - (call.answeredAt || call.createdAt)) / 1000);

  // Save call record to Firebase
  await firebaseService.saveCallRecord({
    id: call.callId,
    duration: String(call.duration),
    dateTime: call.createdAt,
    fromName: call.leadName,
    toName: call.leadName,
    success: call.answeredAt != null,
    callType: 'outbound',
    endCallReason: call.leadStatus || 'completed',
    company: call.metadata?.companyId || '',
  });

  // Clean up after a delay
  setTimeout(() => {
    activeCalls.delete(call.callId);
    ttsService.cleanup(call.callId);
  }, 60000);
}

/**
 * Handle channel state changes
 */
async function handleChannelStateChange(event) {
  const channelId = event.channel?.id;
  const state = event.channel?.state;
  const call = Array.from(activeCalls.values()).find(c => c.channelId === channelId);
  
  if (!call) return;

  console.log(`[${call.callId}] Channel state: ${state}`);
  
  if (state === 'Ringing') {
    call.status = 'ringing';
    await firebaseService.updateCallSession(call.callSessionId, { status: 'ringing' });
  } else if (state === 'Up') {
    call.status = 'answered';
    await firebaseService.updateCallSession(call.callSessionId, { status: 'in-progress' });
  }
}

/**
 * Replace placeholders in text
 */
function replacePlaceholders(text, data) {
  return text
    .replace(/\{\{clientName\}\}/gi, data.leadName || 'valued customer')
    .replace(/\{\{leadName\}\}/gi, data.leadName || 'valued customer')
    .replace(/\{\{name\}\}/gi, data.leadName || 'valued customer')
    .replace(/\{\{assistantName\}\}/gi, data.assistantName || 'your assistant')
    .replace(/\{\{companyName\}\}/gi, data.companyName || 'our company')
    .replace(/\{\{company\}\}/gi, data.companyName || 'our company');
}

/**
 * Format phone number for SIP
 */
function formatNumber(number) {
  // Remove all non-digit characters except +
  let formatted = number.replace(/[^\d+]/g, '');
  // Remove leading + if present
  if (formatted.startsWith('+')) {
    formatted = formatted.substring(1);
  }
  return formatted;
}

// Start server
app.listen(PORT, async () => {
  console.log(`VoiceFlow Asterisk Bridge running on port ${PORT}`);
  
  // Connect to Asterisk ARI
  try {
    await ariClient.connect();
    console.log('Connected to Asterisk ARI');
  } catch (error) {
    console.error('Failed to connect to Asterisk ARI:', error.message);
    console.log('Bridge will continue running - calls will fail until ARI is connected');
  }
  
  // Initialize Firebase
  try {
    await firebaseService.initialize();
    console.log('Firebase initialized');
  } catch (error) {
    console.error('Failed to initialize Firebase:', error.message);
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await ariClient.disconnect();
  process.exit(0);
});

module.exports = app;

