const {initializeApp, applicationDefault} = require('firebase-admin/app');
const {getFirestore, FieldValue} = require('firebase-admin/firestore');

// Utility helpers copied from firebase/functions/voice_service.js so the
// migration behaves exactly like the runtime logic.
function collectPhoneNumbers(raw) {
  const numbers = new Set();
  const visit = (value) => {
    if (!value) {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) {
        numbers.add(trimmed);
      }
    }
  };
  visit(raw);
  return numbers;
}

function flattenPhoneEntries(raw) {
  const entries = [];
  const visit = (value) => {
    if (!value) {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value === 'object' && !Array.isArray(value)) {
      entries.push(value);
    }
  };
  visit(raw);
  return entries;
}

function buildEntryKey(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  if (entry.id) {
    return `id:${entry.id}`;
  }
  if (entry.phoneNumber) {
    return `phone:${entry.phoneNumber}`;
  }
  return null;
}

function normalizePhoneEntries(rawEntries) {
  const map = new Map();
  const existing = flattenPhoneEntries(rawEntries);
  existing.forEach((entry) => {
    const key = buildEntryKey(entry);
    if (!key) {
      return;
    }
    const current = map.get(key) || {};
    map.set(key, {...current, ...entry});
  });
  return map;
}

async function migrateCompanyDocument(doc) {
  const data = doc.data() || {};
  const normalizedNumbers = Array.from(collectPhoneNumbers(data.companyPhoneNumbers));
  const normalizedMap = Array.from(normalizePhoneEntries(data.phoneNumberMap).values());

  const shouldUpdate =
    JSON.stringify(normalizedNumbers) !== JSON.stringify(data.companyPhoneNumbers || []) ||
    JSON.stringify(normalizedMap) !== JSON.stringify(data.phoneNumberMap || []);

  if (!shouldUpdate) {
    return false;
  }

  await doc.ref.set(
    {
      companyPhoneNumbers: normalizedNumbers,
      phoneNumberMap: normalizedMap,
      migratedPhoneMetadataAt: FieldValue.serverTimestamp(),
    },
    {merge: true},
  );

  return true;
}

async function migrate() {
  initializeApp({
    credential: applicationDefault(),
  });

  const db = getFirestore();
  const companiesSnapshot = await db.collection('Company').get();
  let updatedCount = 0;

  for (const doc of companiesSnapshot.docs) {
    /* eslint-disable no-await-in-loop */
    const updated = await migrateCompanyDocument(doc);
    if (updated) {
      updatedCount += 1;
      console.log(`Updated company ${doc.id}`);
    }
    /* eslint-enable no-await-in-loop */
  }

  console.log(`Migration complete. Updated ${updatedCount} company documents.`);
}

if (require.main === module) {
  migrate().catch((error) => {
    console.error('Migration failed', error);
    process.exit(1);
  });
}

