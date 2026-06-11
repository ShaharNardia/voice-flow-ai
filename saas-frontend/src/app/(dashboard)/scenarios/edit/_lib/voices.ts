export const LANGUAGES = [
  { value: "he-IL", label: "Hebrew (Israel)" },
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "en-AU", label: "English (AU)" },
  { value: "ar", label: "Arabic" },
] as const;

export const VOICES_BY_LANG: Record<string, { value: string; label: string }[]> = {
  "en-US": [
    { value: "Google.en-US-Neural2-F", label: "Google Neural2-F (Female)" },
    { value: "Google.en-US-Neural2-J", label: "Google Neural2-J (Male)" },
    { value: "Google.en-US-Neural2-C", label: "Google Neural2-C (Female)" },
    { value: "Google.en-US-Neural2-I", label: "Google Neural2-I (Male)" },
    { value: "Polly.Joanna", label: "Polly Joanna (Female)" },
    { value: "Polly.Matthew", label: "Polly Matthew (Male)" },
    { value: "Polly.Amy", label: "Polly Amy (Female, UK)" },
  ],
  "en-GB": [
    { value: "Google.en-GB-Neural2-A", label: "Google Neural2-A (Female)" },
    { value: "Google.en-GB-Neural2-B", label: "Google Neural2-B (Male)" },
    { value: "Polly.Amy", label: "Polly Amy (Female)" },
    { value: "Polly.Brian", label: "Polly Brian (Male)" },
  ],
  "en-AU": [
    { value: "Google.en-AU-Neural2-A", label: "Google Neural2-A (Female)" },
    { value: "Google.en-AU-Neural2-B", label: "Google Neural2-B (Male)" },
    { value: "Google.en-AU-Neural2-C", label: "Google Neural2-C (Female)" },
    { value: "Google.en-AU-Neural2-D", label: "Google Neural2-D (Male)" },
    { value: "Polly.Olivia", label: "Polly Olivia (Female)" },
    { value: "Polly.Russell", label: "Polly Russell (Male)" },
  ],
  "he-IL": [
    { value: "openai:nova", label: "OpenAI Nova (Female, Recommended)" },
    { value: "openai:alloy", label: "OpenAI Alloy (Neutral)" },
    { value: "openai:shimmer", label: "OpenAI Shimmer (Female)" },
    { value: "openai:echo", label: "OpenAI Echo (Male)" },
    { value: "openai:onyx", label: "OpenAI Onyx (Male, Deep)" },
    { value: "Google.he-IL-Chirp3-HD-Achird", label: "Google Chirp3 Achird (Male)" },
    { value: "Google.he-IL-Chirp3-HD-Kore", label: "Google Chirp3 Kore (Female)" },
    { value: "Google.he-IL-Wavenet-D", label: "Google Wavenet-D (Male)" },
    { value: "Google.he-IL-Wavenet-A", label: "Google Wavenet-A (Female)" },
    { value: "Google.he-IL-Wavenet-B", label: "Google Wavenet-B (Male)" },
    { value: "Google.he-IL-Wavenet-C", label: "Google Wavenet-C (Female)" },
  ],
  "ar": [
    { value: "Google.ar-XA-Wavenet-A", label: "Google Wavenet-A (Female)" },
    { value: "Google.ar-XA-Wavenet-B", label: "Google Wavenet-B (Male)" },
    { value: "Polly.Zeina", label: "Polly Zeina (Female)" },
  ],
};

export function getVoicesForLanguage(lang: string): { value: string; label: string }[] {
  return VOICES_BY_LANG[lang] || VOICES_BY_LANG["en-US"];
}
