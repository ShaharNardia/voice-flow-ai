/**
 * twiml-parser.js
 * Parses Twilio-compatible TwiML XML into an ordered action list.
 *
 * Supported verbs: <Say>, <Play>, <Stream>, <Connect><Stream>,
 *                  <Start><Stream>, <Pause>, <Hangup>, <Redirect>, <Dial>
 *
 * Uses xml2js with preserveChildrenOrder + explicitChildren so that mixed
 * verb sequences like <Say>…</Say><Stream .../> execute in document order.
 */
const xml2js = require('xml2js');

const parser = new xml2js.Parser({
  explicitArray:         true,
  explicitCharkey:       true,
  explicitChildren:      true,   // puts ordered children in node.$$
  preserveChildrenOrder: true,   // $$ array is in document order
  charsAsChildren:       false,
});

/**
 * Parse TwiML XML string → ordered array of action objects.
 */
async function parseTwiml(xml) {
  const result = await parser.parseStringPromise(xml);
  const response = result?.Response;
  if (!response) throw new Error('TwiML missing <Response> root');

  // $$ is the ordered children array when explicitChildren + preserveChildrenOrder are on.
  const children = response.$$ || [];

  // Fallback: if no $$ (empty Response or no children), return empty.
  if (children.length === 0) return [];

  const actions = [];

  for (const node of children) {
    const verb  = node['#name'];
    const attrs = node?.$ || {};
    const text  = (node?._ ?? '').trim();

    switch (verb) {
      case 'Say':
        actions.push({ verb: 'Say', attrs, text });
        break;

      case 'Play':
        actions.push({ verb: 'Play', attrs, url: text });
        break;

      case 'Pause':
        actions.push({ verb: 'Pause', attrs, length: parseInt(attrs.length ?? '1', 10) });
        break;

      case 'Hangup':
        actions.push({ verb: 'Hangup' });
        break;

      case 'Redirect':
        actions.push({ verb: 'Redirect', url: text, attrs });
        break;

      case 'Dial': {
        // <Dial>+972501234567</Dial>  or  <Dial><Number>…</Number></Dial>
        const dialChildren = node.$$ || [];
        const numNode = dialChildren.find(c => c['#name'] === 'Number');
        const number = numNode ? (numNode._ ?? '').trim() : text;
        actions.push({ verb: 'Dial', number, attrs });
        break;
      }

      case 'Start': {
        // <Start><Stream url="…"/></Start>
        const streams = node.$$ || [];
        for (const s of streams) {
          if (s['#name'] === 'Stream') {
            actions.push({ verb: 'Stream', attrs: s?.$ ?? {}, mode: 'start' });
          }
        }
        break;
      }

      case 'Connect': {
        // <Connect><Stream url="…"/></Connect>  — bidirectional / realtime
        const streams = node.$$ || [];
        for (const s of streams) {
          if (s['#name'] === 'Stream') {
            actions.push({ verb: 'Stream', attrs: s?.$ ?? {}, mode: 'connect' });
          }
        }
        break;
      }

      case 'Stream':
        // Top-level <Stream> (non-standard but occasionally generated)
        actions.push({ verb: 'Stream', attrs, mode: 'direct' });
        break;

      default:
        // Unknown verb — ignore silently (forward compat)
        break;
    }
  }

  return actions;
}

module.exports = { parseTwiml };
