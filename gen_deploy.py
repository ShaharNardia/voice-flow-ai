import base64, json

files = [
    ('sip-manager.js', r'C:\Repos\voice-flow-ai\sip-bridge\sip-manager.js'),
    ('call-manager.js', r'C:\Repos\voice-flow-ai\sip-bridge\call-manager.js'),
    ('index.js', r'C:\Repos\voice-flow-ai\sip-bridge\index.js'),
    ('dashboard.js', r'C:\Repos\voice-flow-ai\sip-bridge\dashboard.js'),
]

lines = ['#!/bin/bash', 'set -e', 'echo "=== Starting VoiceFlow Bridge Deploy ==="']
for fname, fpath in files:
    with open(fpath, 'rb') as f:
        b64 = base64.b64encode(f.read()).decode()
    dest = f'/opt/voiceflow/sip-bridge/{fname}'
    lines.append(f"python3 -c \"import base64; open('{dest}','wb').write(base64.b64decode('{b64}'))\" && echo \"OK: {fname}\"")

lines.append('pm2 restart voiceflow-bridge && echo "=== DEPLOY COMPLETE ==="')
script = '\n'.join(lines)

with open(r'C:\Repos\voice-flow-ai\sip-bridge\deploy.sh', 'w', newline='\n') as f:
    f.write(script)

# Firebase function that serves the script
js = "const { onRequest } = require('firebase-functions/v2/https');\n"
js += "const SCRIPT = " + json.dumps(script) + ";\n"
js += """exports.bridgeDeploy = onRequest({ region: 'us-central1', memory: '512MiB', timeoutSeconds: 10 }, (req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  res.send(SCRIPT);
});
"""
with open(r'C:\Repos\voice-flow-ai\firebase\functions\bridge_deploy.js', 'w', newline='\n') as f:
    f.write(js)

print(f'deploy.sh: {len(script)} bytes')
print(f'bridge_deploy.js: {len(js)} bytes')
