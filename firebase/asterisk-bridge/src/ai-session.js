/**
 * AI Session — Full conversational AI loop for Asterisk calls
 *
 * Flow per turn:
 *   record speech (VAD) → Deepgram STT → GPT-4o-mini → Google TTS → play → repeat
 *
 * Drop-in replacement for the DTMF-only handler in index.js.
 */

'use strict';

const axios = require('axios');
const fs    = require('fs');
const path  = require('path');

const ttsService      = require('./tts-service');
const ariClient       = require('./ari-client');
const firebaseService = require('./firebase-service');

const OPENAI_API_KEY     = process.env.OPENAI_API_KEY;
const DEEPGRAM_API_KEY   = process.env.DEEPGRAM_API_KEY;
const LLM_MODEL          = process.env.LLM_MODEL          || 'gpt-4o-mini';
const MAX_TURNS          = parseInt(process.env.MAX_CONVERSATION_TURNS) || 10;
const MAX_SILENCE_SEC    = parseInt(process.env.MAX_SILENCE_SECONDS)    || 3;
const RECORDING_DIR      = process.env.ASTERISK_RECORDING_DIR || '/var/spool/asterisk/recording';

// Words that signal the conversation should end (add more per language as needed)
const GOODBYE_TOKENS = [
  'goodbye', 'bye', 'have a great', 'take care', 'talk soon',
  'שלום', 'יום טוב', 'להתראות', 'ביי',
  'وداعا', 'في أمان الله',
];

class AiSession {
  constructor(call) {
    // call: { callId, channelId, callSessionId, audioFile, leadName, companyName,
    //         assistantName, metadata }
    this.call      = call;
    this.history   = [];   // [{role, content}]
    this.active    = true;
    this.turn      = 0;
    this.assistant = {};
    this.language  = 'he-IL';
  }

  // ── Public entry point ───────────────────────────────────────────────────

  async start() {
    // Load assistant & session data
    try {
      const sessionData = await firebaseService.getCallSession(this.call.callSessionId);
      this.assistant = sessionData?.assistantDefinition || {};
      this.language  = this.assistant.language || 'he-IL';
    } catch (e) {
      console.error(`[AI ${this.call.callId}] Could not load session data: ${e.message}`);
    }

    // Answer the channel
    await ariClient.answerChannel(this.call.channelId);

    // Play the pre-generated greeting TTS (created before the call was placed)
    if (this.call.audioFile) {
      try {
        await ariClient.playAndWait(this.call.channelId, this.call.audioFile);
      } catch (e) {
        console.error(`[AI ${this.call.callId}] Greeting playback error: ${e.message}`);
      }
    }

    // Conversation loop
    while (this.active && this.turn < MAX_TURNS) {
      try {
        await this.runTurn();
      } catch (e) {
        console.error(`[AI ${this.call.callId}] Turn error: ${e.message}`);
        this.active = false;
      }
    }

    // Hang up cleanly
    try { await ariClient.hangupChannel(this.call.channelId); } catch (_) {}
  }

  // ── Single conversation turn ─────────────────────────────────────────────

  async runTurn() {
    this.turn++;
    const recordingName = `voiceflow-${this.call.callId}-t${this.turn}`;
    const recordingPath = path.join(RECORDING_DIR, `${recordingName}.wav`);

    console.log(`[AI ${this.call.callId}] Turn ${this.turn}: recording...`);

    // 1. Record with VAD (silence detection stops recording automatically)
    try {
      await ariClient.recordWithVAD(this.call.channelId, recordingName, MAX_SILENCE_SEC);
    } catch (e) {
      console.error(`[AI ${this.call.callId}] Recording error: ${e.message}`);
      await this.sayNoResponse();
      return;
    }

    // 2. Transcribe
    let transcript = '';
    if (fs.existsSync(recordingPath)) {
      try {
        transcript = await this.transcribe(recordingPath);
      } catch (e) {
        console.error(`[AI ${this.call.callId}] Transcription error: ${e.message}`);
      }
      try { fs.unlinkSync(recordingPath); } catch (_) {}
    }

    console.log(`[AI ${this.call.callId}] Transcript: "${transcript}"`);

    if (!transcript.trim()) {
      await this.sayNoResponse();
      return;
    }

    this.history.push({ role: 'user', content: transcript });

    // 3. LLM response
    let reply = '';
    try {
      reply = await this.llmReply();
    } catch (e) {
      console.error(`[AI ${this.call.callId}] LLM error: ${e.message}`);
      reply = this.language.startsWith('he') ? 'רגע אחד בבקשה...' : 'One moment please...';
    }

    this.history.push({ role: 'assistant', content: reply });
    console.log(`[AI ${this.call.callId}] Reply: "${reply}"`);

    // 4. TTS + play
    try {
      const audioFile = await ttsService.synthesize(reply, `${this.call.callId}-r${this.turn}`);
      await ariClient.playAndWait(this.call.channelId, audioFile);
    } catch (e) {
      console.error(`[AI ${this.call.callId}] TTS/playback error: ${e.message}`);
    }

    // 5. Non-blocking Firebase update
    firebaseService.updateCallSession(this.call.callSessionId, {
      conversationHistory: this.history,
      lastUserSpeech:      transcript,
      lastAIResponse:      reply,
    }).catch(() => {});

    // 6. End if AI said goodbye
    if (this.isGoodbye(reply)) {
      this.active = false;
    }
  }

  // ── STT — Deepgram HTTP API ──────────────────────────────────────────────

  async transcribe(filePath) {
    if (!DEEPGRAM_API_KEY) throw new Error('DEEPGRAM_API_KEY not set');

    const lang = this.language.startsWith('he') ? 'he'
               : this.language.startsWith('ar') ? 'ar'
               : 'en';

    const audio    = fs.readFileSync(filePath);
    const response = await axios.post(
      `https://api.deepgram.com/v1/listen?model=nova-2&language=${lang}&punctuate=true&smart_format=true`,
      audio,
      {
        headers: {
          'Authorization': `Token ${DEEPGRAM_API_KEY}`,
          'Content-Type': 'audio/wav',
        },
        timeout: 15000,
      }
    );

    return response.data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
  }

  // ── LLM — OpenAI ─────────────────────────────────────────────────────────

  async llmReply() {
    if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');

    const messages = [
      { role: 'system', content: this.buildSystemPrompt() },
      ...this.history.slice(-20),  // cap context
    ];

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model:       LLM_MODEL,
        messages,
        max_tokens:  150,
        temperature: 0.8,
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type':  'application/json',
        },
        timeout: 10000,
      }
    );

    return response.data?.choices?.[0]?.message?.content?.trim() || '';
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  buildSystemPrompt() {
    const a    = this.assistant;
    const lang = this.language.startsWith('he') ? 'עברית'
               : this.language.startsWith('ar') ? 'العربية'
               : 'English';

    const identity = [
      `You are ${a.assistantName || a.name || 'an AI assistant'}`,
      a.companyName ? ` from ${a.companyName}` : '',
      '.',
    ].join('');

    const base = a.systemPrompt ||
      `You are a helpful phone assistant. Be concise and natural. Always respond in ${lang}.`;

    return [
      identity,
      '',
      base,
      '',
      'IMPORTANT: You are on a phone call. Keep replies to 1–2 short sentences.',
      'Do NOT use markdown, lists, bullet points, or emojis.',
      'Speak naturally as if talking — no written formatting.',
    ].join('\n');
  }

  isGoodbye(text) {
    const lower = text.toLowerCase();
    return GOODBYE_TOKENS.some(w => lower.includes(w));
  }

  async sayNoResponse() {
    const msg = this.language.startsWith('he')
      ? 'לא קיבלתי תשובה. איך אני יכול לעזור?'
      : 'I didn\'t catch that — how can I help?';
    try {
      const audio = await ttsService.synthesize(msg, `${this.call.callId}-noresp-${this.turn}`);
      await ariClient.playAndWait(this.call.channelId, audio);
    } catch (_) {}
  }
}

module.exports = AiSession;
