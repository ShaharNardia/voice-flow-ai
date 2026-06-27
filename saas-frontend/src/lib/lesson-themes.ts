// Theme / module library for the English tutor.
// Mirrors the THEMES object in firebase/functions/tutor_service.js — keep in sync.

export interface LessonModule {
  id: string;
  title: string;
  goals: string;
}

export interface LessonTheme {
  id: string;
  emoji: string;
  label: string;
  blurb: string;
  modules: LessonModule[] | null;   // null = free conversation
  /** Optional CEFR level badge, e.g. "a1" | "a2" | "b1" — used in multi-level courses like Romanian. */
  level?: "a1" | "a2" | "b1" | "b2" | "c1";
  /** Optional textbook page reference shown in the lesson detail UI. */
  textbookRef?: string;
}

export const THEMES: LessonTheme[] = [
  {
    id: "travel", emoji: "✈️", label: "Travel & Airports",
    blurb: "Get ready for your next trip — airports, hotels, and getting around.",
    modules: [
      {id: "book-flight", title: "Booking a flight", goals: "ask about prices, use the future tense, confirm dates"},
      {id: "at-airport", title: "At the airport", goals: "check-in vocabulary, security, polite requests"},
      {id: "lost-luggage", title: "Lost luggage", goals: "polite complaints, past tense, filing a report"},
      {id: "hotel", title: "Hotel check-in", goals: "requests with 'could/would', amenities vocab"},
    ],
  },
  {
    id: "work", emoji: "💼", label: "Work & Careers",
    blurb: "Daily office English — meetings, feedback, and emails.",
    modules: [
      {id: "introducing-yourself", title: "Introducing yourself at work", goals: "present-simple for job duties, adjectives for strengths"},
      {id: "meetings", title: "Running a meeting", goals: "agenda vocab, agreeing/disagreeing politely"},
      {id: "emails", title: "Professional emails (spoken)", goals: "formal register, closings, requests"},
      {id: "performance-review", title: "Performance conversations", goals: "past perfect, feedback vocab"},
    ],
  },
  {
    id: "food", emoji: "🍽️", label: "Food & Restaurants",
    blurb: "Order, describe, and enjoy food in English.",
    modules: [
      {id: "ordering", title: "Ordering at a restaurant", goals: "menu vocab, preferences, allergies"},
      {id: "complaining", title: "Politely complaining about food", goals: "'I'm afraid...', would-you-mind structures"},
      {id: "recipes", title: "Describing a recipe", goals: "sequencing words (first, then), imperative"},
    ],
  },
  {
    id: "shopping", emoji: "🛍️", label: "Shopping",
    blurb: "Navigate stores, returns, and even a little bargaining.",
    modules: [
      {id: "sizes-prices", title: "Asking about sizes and prices", goals: "comparatives, numbers"},
      {id: "returns", title: "Making a return", goals: "past tense, receipt vocab, polite insistence"},
      {id: "bargaining", title: "Bargaining at a market", goals: "offers, counter-offers, 'how about...'"},
    ],
  },
  {
    id: "health", emoji: "🏥", label: "Health & Doctor",
    blurb: "Describe symptoms and handle medical situations.",
    modules: [
      {id: "symptoms", title: "Describing symptoms", goals: "body vocab, duration, pain scales"},
      {id: "pharmacy", title: "At the pharmacy", goals: "dosage vocab, side effects, reading labels"},
      {id: "emergency", title: "Calling an ambulance", goals: "urgency vocab, giving address"},
    ],
  },
  {
    id: "smalltalk", emoji: "💬", label: "Small Talk",
    blurb: "Casual chats — weather, weekends, and warm openers.",
    modules: [
      {id: "weather", title: "Weather chat", goals: "comparative weather vocab, future going-to"},
      {id: "weekend", title: "Weekend plans", goals: "future continuous, plans vocab"},
      {id: "compliments", title: "Giving & receiving compliments", goals: "polite acceptance, reciprocating"},
    ],
  },
  {
    id: "news", emoji: "📰", label: "News & Current Events",
    blurb: "Discuss what's happening in the world.",
    modules: [
      {id: "discussing-news", title: "Discussing a news story", goals: "reported speech, opinions"},
      {id: "debating", title: "Friendly debate", goals: "agreeing, disagreeing, conceding"},
    ],
  },
  {
    id: "interview", emoji: "🎤", label: "Job Interview",
    blurb: "Nail your next English-language interview.",
    modules: [
      {id: "tell-me-about-yourself", title: "'Tell me about yourself'", goals: "elevator pitch, past experience"},
      {id: "strengths-weaknesses", title: "Strengths & weaknesses", goals: "self-reflection, constructive framing"},
      {id: "salary-negotiation", title: "Salary conversation", goals: "numbers, conditionals, polite firmness"},
    ],
  },
  {
    id: "presentations", emoji: "📊", label: "Business Presentations",
    blurb: "Present confidently in English.",
    modules: [
      {id: "opening", title: "Opening a presentation", goals: "welcoming, outlining, signposting"},
      {id: "data", title: "Describing charts & data", goals: "trend vocab, comparatives"},
      {id: "qna", title: "Handling Q&A", goals: "clarifying, admitting uncertainty, deflecting"},
    ],
  },
  {
    id: "relationships", emoji: "❤️", label: "Relationships & Family",
    blurb: "Talk about the people in your life.",
    modules: [
      {id: "family", title: "Talking about family", goals: "family vocab, present perfect"},
      {id: "friendship", title: "Describing a close friend", goals: "personality adjectives, relative clauses"},
      {id: "feelings", title: "Expressing feelings", goals: "emotion vocab, cause-effect framing"},
    ],
  },
  {
    id: "tech", emoji: "💻", label: "Technology",
    blurb: "Talk apps, AI, and troubleshooting.",
    modules: [
      {id: "explain-app", title: "Explaining an app you use", goals: "tech vocab, cause-effect"},
      {id: "troubleshooting", title: "Describing a tech problem", goals: "past tense, sequencing"},
      {id: "ai-chat", title: "Talking about AI", goals: "opinion, hypothetical"},
    ],
  },
  {
    id: "pronunciation", emoji: "🗣️", label: "Pronunciation Practice",
    blurb: "Coach focuses on your accent — listens, models, has you repeat.",
    modules: [
      {id: "th-sounds", title: "TH sounds (think / this)", goals: "voiced and unvoiced 'th' — tongue tip between the teeth"},
      {id: "r-vs-l", title: "R vs L", goals: "American 'r' (no tongue trill) vs clear 'l'"},
      {id: "vowel-length", title: "Long vs short vowels", goals: "ship vs sheep, full vs fool, sit vs seat"},
      {id: "word-stress", title: "Word stress", goals: "stress the right syllable — PHO-to-graph vs pho-TO-gra-phy"},
      {id: "sentence-rhythm", title: "Sentence rhythm & intonation", goals: "rising vs falling tones, stressed content words"},
      {id: "common-killers", title: "Common accent killers", goals: "schwa /ə/, silent letters, /v/ vs /w/, /æ/ vs /e/"},
    ],
  },
  {
    id: "freechat", emoji: "🗨️", label: "Free Conversation",
    blurb: "Open-ended chat — perfect for maintenance practice.",
    modules: null,
  },
];

export const CATEGORY_EMOJI: Record<string, string> = {
  grammar: "📝",
  vocabulary: "📚",
  pronunciation: "🗣️",
  phrasing: "✨",
  accent: "🎙️",
  intonation: "🎵",
};

export const DURATION_OPTIONS = [5, 10, 15, 30] as const;
