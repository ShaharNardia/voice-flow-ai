const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.OPENAI_API_KEY;
const OUTPUT_DIR = 'C:\\Users\\Shaha';

const sentences = [
  'שלום! אני חן מחברת לנסלוט טכנולוגיות. במה אוכל לעזור לך היום?',
  'מעולה! קבעתי לך פגישה ליום רביעי, עשרים ושישה במרס, בשעה עשר בבוקר.',
  'המחיר מתחיל מעשרת אלפים שקל לאתר בסיסי.',
  'אשמח לעזור! מה סוג הפרויקט שאתה מתכנן?',
];

const configs = [
  { model: 'tts-1', voice: 'alloy', prefix: 'test_final_alloy' },
  { model: 'tts-1', voice: 'nova', prefix: 'test_final_nova' },
  { model: 'tts-1', voice: 'shimmer', prefix: 'test_final_shimmer' },
  { model: 'tts-1-hd', voice: 'alloy', prefix: 'test_final_alloy_hd' },
  { model: 'tts-1-hd', voice: 'nova', prefix: 'test_final_nova_hd' },
];

function generateTTS(model, voice, text, outputPath) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model,
      voice,
      input: text,
      response_format: 'mp3',
    });

    const start = Date.now();

    const req = https.request(
      {
        hostname: 'api.openai.com',
        path: '/v1/audio/speech',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        if (res.statusCode !== 200) {
          let errData = '';
          res.on('data', (d) => (errData += d));
          res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${errData}`)));
          return;
        }
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          fs.writeFileSync(outputPath, buffer);
          const elapsed = Date.now() - start;
          const sizeKB = (buffer.length / 1024).toFixed(1);
          console.log(`  OK ${path.basename(outputPath)} — ${elapsed}ms, ${sizeKB} KB`);
          resolve({ file: outputPath, elapsed, size: buffer.length });
        });
      }
    );

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log(`Generating Hebrew TTS samples...`);
  console.log(`Output directory: ${OUTPUT_DIR}\n`);

  let totalFiles = 0;
  let totalTime = 0;

  for (const cfg of configs) {
    console.log(`\n[${cfg.model}] voice="${cfg.voice}" (${cfg.prefix})`);
    for (let i = 0; i < sentences.length; i++) {
      const filename = `${cfg.prefix}_${i + 1}.mp3`;
      const outputPath = path.join(OUTPUT_DIR, filename);
      try {
        const result = await generateTTS(cfg.model, cfg.voice, sentences[i], outputPath);
        totalFiles++;
        totalTime += result.elapsed;
      } catch (err) {
        console.error(`  FAIL ${filename}: ${err.message}`);
      }
    }
  }

  console.log(`\n========================================`);
  console.log(`Done! ${totalFiles} files generated in ${(totalTime / 1000).toFixed(1)}s total`);
  console.log(`Average: ${(totalTime / totalFiles).toFixed(0)}ms per sample`);
}

main().catch(console.error);
