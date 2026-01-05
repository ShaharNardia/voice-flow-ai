/**
 * TTS Service
 * 
 * Text-to-Speech service supporting multiple providers:
 * - Ollama (local LLM - needs external TTS)
 * - Google TTS
 * - Festival (local)
 * - External API
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Audio files directory
const AUDIO_DIR = process.env.AUDIO_DIR || '/var/lib/asterisk/sounds/voiceflow';

// Ensure audio directory exists
if (!fs.existsSync(AUDIO_DIR)) {
  try {
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
  } catch (e) {
    console.warn('Could not create audio directory:', e.message);
  }
}

/**
 * Synthesize text to speech
 * Returns the path to the audio file (relative to Asterisk sounds directory)
 */
async function synthesize(text, callId) {
  const provider = process.env.TTS_PROVIDER || 'festival';
  const filename = `voiceflow-${callId}`;
  
  console.log(`[TTS] Synthesizing with ${provider}: "${text.substring(0, 50)}..."`);

  switch (provider.toLowerCase()) {
    case 'google':
      return await synthesizeGoogle(text, filename);
    case 'festival':
      return await synthesizeFestival(text, filename);
    case 'espeak':
      return await synthesizeEspeak(text, filename);
    case 'external':
      return await synthesizeExternal(text, filename);
    default:
      // Fallback to Festival
      return await synthesizeFestival(text, filename);
  }
}

/**
 * Synthesize using Google Cloud TTS
 */
async function synthesizeGoogle(text, filename) {
  try {
    const textToSpeech = require('@google-cloud/text-to-speech');
    const client = new textToSpeech.TextToSpeechClient();

    const request = {
      input: { text },
      voice: {
        languageCode: process.env.TTS_LANGUAGE || 'he-IL',
        name: process.env.TTS_VOICE || 'he-IL-Wavenet-A',
      },
      audioConfig: {
        audioEncoding: 'LINEAR16',
        sampleRateHertz: 8000, // Asterisk standard
      },
    };

    const [response] = await client.synthesizeSpeech(request);
    
    const outputPath = path.join(AUDIO_DIR, `${filename}.wav`);
    fs.writeFileSync(outputPath, response.audioContent, 'binary');
    
    console.log(`[TTS] Google: Saved to ${outputPath}`);
    return `voiceflow/${filename}`;
    
  } catch (error) {
    console.error('[TTS] Google failed:', error.message);
    throw error;
  }
}

/**
 * Synthesize using Festival (local)
 */
async function synthesizeFestival(text, filename) {
  try {
    const outputPath = path.join(AUDIO_DIR, `${filename}.wav`);
    
    // Escape text for shell
    const escapedText = text.replace(/'/g, "'\\''");
    
    // Use Festival to synthesize
    const command = `echo '${escapedText}' | text2wave -o ${outputPath}`;
    
    await execAsync(command);
    
    // Convert to 8kHz mono for Asterisk
    const finalPath = path.join(AUDIO_DIR, `${filename}-8k.wav`);
    await execAsync(`sox ${outputPath} -r 8000 -c 1 ${finalPath}`);
    
    // Clean up original
    fs.unlinkSync(outputPath);
    fs.renameSync(finalPath, outputPath);
    
    console.log(`[TTS] Festival: Saved to ${outputPath}`);
    return `voiceflow/${filename}`;
    
  } catch (error) {
    console.error('[TTS] Festival failed:', error.message);
    // Fallback to espeak
    return await synthesizeEspeak(text, filename);
  }
}

/**
 * Synthesize using eSpeak (local)
 */
async function synthesizeEspeak(text, filename) {
  try {
    const outputPath = path.join(AUDIO_DIR, `${filename}.wav`);
    
    // Escape text for shell
    const escapedText = text.replace(/"/g, '\\"');
    
    // Language selection
    const lang = process.env.TTS_LANGUAGE?.startsWith('he') ? 'he' : 'en';
    
    // Use espeak to synthesize
    const command = `espeak -v${lang} -w ${outputPath} "${escapedText}"`;
    
    await execAsync(command);
    
    console.log(`[TTS] eSpeak: Saved to ${outputPath}`);
    return `voiceflow/${filename}`;
    
  } catch (error) {
    console.error('[TTS] eSpeak failed:', error.message);
    throw error;
  }
}

/**
 * Synthesize using external API
 */
async function synthesizeExternal(text, filename) {
  try {
    const apiUrl = process.env.TTS_API_URL;
    const apiKey = process.env.TTS_API_KEY;
    
    if (!apiUrl) {
      throw new Error('TTS_API_URL not configured');
    }

    const response = await axios.post(apiUrl, {
      text,
      voice: process.env.TTS_VOICE || 'default',
      language: process.env.TTS_LANGUAGE || 'he-IL',
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      responseType: 'arraybuffer',
    });

    const outputPath = path.join(AUDIO_DIR, `${filename}.wav`);
    fs.writeFileSync(outputPath, response.data);
    
    console.log(`[TTS] External: Saved to ${outputPath}`);
    return `voiceflow/${filename}`;
    
  } catch (error) {
    console.error('[TTS] External failed:', error.message);
    throw error;
  }
}

/**
 * Clean up audio files for a call
 */
function cleanup(callId) {
  try {
    const pattern = `voiceflow-${callId}`;
    const files = fs.readdirSync(AUDIO_DIR);
    
    for (const file of files) {
      if (file.includes(pattern)) {
        const filePath = path.join(AUDIO_DIR, file);
        fs.unlinkSync(filePath);
        console.log(`[TTS] Cleaned up: ${file}`);
      }
    }
  } catch (error) {
    console.warn('[TTS] Cleanup warning:', error.message);
  }
}

/**
 * Pre-generate common phrases
 */
async function pregenerate() {
  const phrases = {
    'beep': 'beep',
    'thank-you': 'Thank you for your time. Goodbye.',
    'callback-soon': 'One of our team members will call you back shortly.',
    'press-1-yes': 'Press 1 if you are interested, or press 2 if not.',
    'no-response': 'We will contact you again soon. Have a great day.',
  };

  console.log('[TTS] Pre-generating common phrases...');
  
  for (const [name, text] of Object.entries(phrases)) {
    try {
      await synthesize(text, `common-${name}`);
    } catch (error) {
      console.warn(`[TTS] Failed to pre-generate ${name}:`, error.message);
    }
  }
}

module.exports = {
  synthesize,
  cleanup,
  pregenerate,
};

