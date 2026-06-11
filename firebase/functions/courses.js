/**
 * Language-course registry. A `course` describes everything that differs
 * between teaching one language vs another: target language, themes,
 * exam-prep focus, scaffold language the tutor may use to explain tricky
 * points, voice presets, and an optional feature-flag gate.
 *
 * Keep in sync with saas-frontend/src/lib/courses.ts (shape is identical).
 */

// ── English (general practice) ────────────────────────────────────────
// Migrated verbatim from the previous tutor_service.js THEMES constant so
// existing students see exactly the same curriculum they had before.
const EN_THEMES = [
  {id: "travel", emoji: "✈️", label: "Travel & Airports", modules: [
    {id: "book-flight", title: "Booking a flight", goals: "ask about prices, use the future tense ('I will travel'), confirm dates"},
    {id: "at-airport", title: "At the airport", goals: "check-in vocabulary, security, polite requests"},
    {id: "lost-luggage", title: "Lost luggage", goals: "polite complaints, past tense, filing a report"},
    {id: "hotel", title: "Hotel check-in", goals: "requests with 'could/would', amenities vocab"},
  ]},
  {id: "work", emoji: "💼", label: "Work & Careers", modules: [
    {id: "introducing-yourself", title: "Introducing yourself at work", goals: "present-simple for job duties, adjectives for strengths"},
    {id: "meetings", title: "Running a meeting", goals: "agenda vocab, agreeing/disagreeing politely"},
    {id: "emails", title: "Professional emails (spoken)", goals: "formal register, closings, requests"},
    {id: "performance-review", title: "Performance conversations", goals: "past perfect, feedback vocab"},
  ]},
  {id: "food", emoji: "🍽️", label: "Food & Restaurants", modules: [
    {id: "ordering", title: "Ordering at a restaurant", goals: "menu vocab, preferences, allergies"},
    {id: "complaining", title: "Politely complaining about food", goals: "'I'm afraid...', would-you-mind structures"},
    {id: "recipes", title: "Describing a recipe", goals: "sequencing words (first, then), imperative"},
  ]},
  {id: "shopping", emoji: "🛍️", label: "Shopping", modules: [
    {id: "sizes-prices", title: "Asking about sizes and prices", goals: "comparatives (bigger/cheaper), numbers"},
    {id: "returns", title: "Making a return", goals: "past tense, receipt vocab, polite insistence"},
    {id: "bargaining", title: "Bargaining at a market", goals: "offers, counter-offers, 'how about...'"},
  ]},
  {id: "health", emoji: "🏥", label: "Health & Doctor", modules: [
    {id: "symptoms", title: "Describing symptoms", goals: "body vocab, duration ('for 3 days'), pain scales"},
    {id: "pharmacy", title: "At the pharmacy", goals: "dosage vocab, side effects, reading labels"},
    {id: "emergency", title: "Calling an ambulance", goals: "urgency vocab, giving address, clear imperatives"},
  ]},
  {id: "smalltalk", emoji: "💬", label: "Small Talk", modules: [
    {id: "weather", title: "Weather chat", goals: "comparative weather vocab, 'I think it's going to...'"},
    {id: "weekend", title: "Weekend plans", goals: "future continuous, plans vocab"},
    {id: "compliments", title: "Giving & receiving compliments", goals: "polite acceptance, reciprocating"},
  ]},
  {id: "news", emoji: "📰", label: "News & Current Events", modules: [
    {id: "discussing-news", title: "Discussing a news story", goals: "reported speech, opinions with 'in my view'"},
    {id: "debating", title: "Friendly debate", goals: "agreeing, disagreeing, conceding a point"},
  ]},
  {id: "interview", emoji: "🎤", label: "Job Interview", modules: [
    {id: "tell-me-about-yourself", title: "'Tell me about yourself'", goals: "elevator pitch, past experience"},
    {id: "strengths-weaknesses", title: "Strengths & weaknesses", goals: "self-reflection vocab, constructive framing"},
    {id: "salary-negotiation", title: "Salary conversation", goals: "numbers, conditionals, polite firmness"},
  ]},
  {id: "presentations", emoji: "📊", label: "Business Presentations", modules: [
    {id: "opening", title: "Opening a presentation", goals: "welcoming, outlining, signposting"},
    {id: "data", title: "Describing charts & data", goals: "trend vocab (rise/fall/stabilize), comparatives"},
    {id: "qna", title: "Handling Q&A", goals: "clarifying, admitting uncertainty, deflecting politely"},
  ]},
  {id: "relationships", emoji: "❤️", label: "Relationships & Family", modules: [
    {id: "family", title: "Talking about family", goals: "family vocab, present perfect ('I've known them...')"},
    {id: "friendship", title: "Describing a close friend", goals: "adjectives for personality, relative clauses"},
    {id: "feelings", title: "Expressing feelings", goals: "emotion vocab, 'I feel... because...'"},
  ]},
  {id: "tech", emoji: "💻", label: "Technology", modules: [
    {id: "explain-app", title: "Explaining an app you use", goals: "tech vocab, cause-effect ('because of this...')"},
    {id: "troubleshooting", title: "Describing a tech problem", goals: "past tense, sequencing, specific vocab"},
    {id: "ai-chat", title: "Talking about AI", goals: "opinion, hypothetical ('if AI could...')"},
  ]},
  {id: "pronunciation", emoji: "🗣️", label: "Pronunciation Practice", modules: [
    {id: "th-sounds", title: "TH sounds (think / this)", goals: "voiced and unvoiced 'th' — tongue tip between the teeth"},
    {id: "r-vs-l", title: "R vs L", goals: "American 'r' (no tongue trill) vs clear 'l'"},
    {id: "vowel-length", title: "Long vs short vowels", goals: "ship vs sheep, full vs fool, sit vs seat"},
    {id: "word-stress", title: "Word stress", goals: "stress the right syllable"},
    {id: "sentence-rhythm", title: "Sentence rhythm & intonation", goals: "rising vs falling tones, stressed content words"},
    {id: "common-killers", title: "Common accent killers", goals: "schwa, silent letters, v/w, æ/e"},
  ]},
  {id: "freechat", emoji: "🗨️", label: "Free Conversation", modules: null},
];

// ── Romanian, zero → B1 (for Hebrew speakers) ─────────────────────────
// Curriculum follows Anna Borca's A1 textbook unit by unit (pp. 1-93),
// then continues into A2 practical content and finally B1 exam prep.
//
// STRUCTURE:
//   • Each A1 theme  = one textbook unit (or half-unit for dense units).
//     `textbookRef` tells the tutor exactly which pages to reference.
//   • A2 themes build on Unit 4+ content and extend to practical daily life.
//   • B1 themes target the oral-exam formats.
//
// The tutor uses Hebrew scaffolding heavily at A1, one-sentence hints at A2,
// and pure Romanian at B1.
const RO_B1_THEMES = [

  // ════════════════════════════════════════════════════════════════════
  // A1 — Unitatea 1  (manual pp. 1-22)
  // Curs #1 (27 apr 2026): fonetică + verbul a fi
  // ════════════════════════════════════════════════════════════════════

  {id: "u1-fonetic", emoji: "🔤", label: "U1 · Fonetică și salutări", level: "a1",
    textbookRef: "Anna Borca pp. 2-8",
    modules: [
      {id: "alfabet-sunete", title: "Alfabetul și sunetele speciale",
        goals: "literele latine pentru vorbitori de ebraică; ă = sunet neutru (ca schwa); î la ÎNCEPUT și SFÂRȘIT de cuvânt (în, a coborî), â la MIJLOC (România, pâine); e=[ie] NUMAI în eu/el/ea/ei/ele/este; ș=[sh], ț=[ts]; ce/ci=[tʃ] dar che/chi=[k]; ge/gi=[dʒ] dar ghe/ghi=[g]; exerciții de pronunție cu: apă, masă, în, pâine, eu, el, ceai, cheie, geantă, gheață"},
      {id: "salutari-zi", title: "Salutări după ora zilei",
        goals: "Bună dimineața! (până la 12), Bună ziua! (12-18), Bună seara! (după 18), Noapte bună!; Bună! / Salut! / Servus! (informal); La revedere! / Pa! / Pe mâine! / Pe curând!; Poftim!? / Nu înțeleg, repetați vă rog! / Nu vorbesc română; practice: student starts and ends 3 conversations at different times of day"},
      {id: "prezentare-dialog", title: "Mă numesc... / Îmi pare bine!",
        goals: "Bună ziua! Numele meu este... / Mă numesc...; Îmi pare bine de cunoștință! → Și mie!; Ce mai faceți? (formal: dumneavoastră) vs Ce mai faci? (informal: tu); Excelent! / Foarte bine! / Așa și așa. / Nu prea bine.; Mulțumesc! → Cu plăcere! / O zi bună! → La fel!; dialog p.7 complet în roleplay cu tutor"},
    ]},

  {id: "u1-a-fi", emoji: "🙋", label: "U1 · Verbul «a fi»", level: "a1",
    textbookRef: "Anna Borca pp. 9-12 · Curs #1",
    modules: [
      {id: "a-fi-conjugare", title: "A fi — toate persoanele + negație",
        goals: "TABEL COMPLET: eu sunt / nu sunt; tu ești / nu ești; el/ea este (=e) / nu este (=nu e); noi suntem / nu suntem; voi sunteți / nu sunteți; ei/ele sunt / nu sunt; forma politicoasă: dumneavoastră sunteți; Ba da (contradict o negație: Nu ești din Israel? — Ba da, sunt din Israel.); exercițiu: studentul completează toate formele verbal cu locații și profesii"},
      {id: "unde-cine-ce", title: "Unde/Cine/Ce ești? — profesii și locații",
        goals: "ÎNTREBĂRI: Cine ești tu? / Ce ești? / Unde ești acum?; PROFESII cu gen: profesor/profesoară, student/studentă, contabil (M+F la fel), inginer/ingineră, avocat/avocată, arhitect, doctor/doctoriță; LOCAȚII: în clasă, acasă (=la casă), la birou, la serviciu, la mare; exercițiu p.12: studentul răspunde la 10 întrebări despre colegi imaginari"},
      {id: "de-unde-tari", title: "De unde ești? — țări și reguli la/în",
        goals: "De unde ești? → Sunt din Israel / din România / din Germania; regula: la + ORAȘ (la Tel Aviv, la București, la Hamburg), în + ȚARĂ (în Israel, în România, în Germania), din + origine (sunt din...); Da/Nu + negație; dialog complet: Ești din Germania? — Nu, nu sunt din Germania. — Ba da, sunt din Germania.; exercițiile 3-4 de la pp.12-13"},
    ]},

  {id: "u1-vorbi-limbi", emoji: "🗣️", label: "U1 · «A vorbi» și limbi", level: "a1",
    textbookRef: "Anna Borca pp. 13-14",
    modules: [
      {id: "a-vorbi-conjugare", title: "Verbul «a vorbi» — conjugare completă",
        goals: "eu vorbesc, tu vorbești, el/ea vorbește, noi vorbim, voi vorbiți, ei/ele vorbesc; Vorbiți limba română? — Da, vorbesc puțin. / Nu, nu vorbesc.; TABEL țări↔limbi: Anglia→engleză, Franța→franceză, Germania→germană, Spania→spaniolă, România→română, Rusia→rusă, Israel→ebraică/arabă, Italia→italiană, Olanda→olandeză, Polonia→poloneză; exercițiile 5-6 de la pp.13-14"},
      {id: "numere-1-19", title: "Numerele 1-19 și genul la numere",
        goals: "1-10: unu, doi, trei, patru, cinci, șase, șapte, opt, nouă, zece; 11-19: unsprezece...nouăsprezece (forme colocviale: unșpe, doișpe...); GEN: doi domni / două doamne (masculin doi, feminin două); Câți colegi? / Câte colege?; Cât costă o cafea? — Costă 12 lei.; exercițiul 7A de la p.14"},
      {id: "numere-20-miliard", title: "Numerele 20–1.000.000 și regula «de»",
        goals: "zeci: douăzeci, treizeci, patruzeci, cincizeci, șaizeci, șaptezeci, optzeci, nouăzeci; 21=douăzeci și unu, 32=treizeci și doi; sute: o sută, două sute...nouă sute; o mie, două mii; un milion, un miliard; REGULA DE: 0-19 fără 'de' (sunt 15 studenți), 20+ cu 'de' (sunt 20 de studenți, costă 150 de lei); exercițiul 7B de la p.15"},
    ]},

  {id: "u1-timp-vreme", emoji: "📅", label: "U1 · Timp, vreme și «a avea»", level: "a1",
    textbookRef: "Anna Borca pp. 16-22",
    modules: [
      {id: "zile-luni-anotimpuri", title: "Zile, luni, anotimpuri și vreme",
        goals: "zilele relative: alaltăieri←ieri←azi(astăzi)→mâine→poimâine→răspoimâine; zilele săptămânii: luni-duminică; lunile: ianuarie-decembrie; anotimpurile: primăvara/vara/toamna/iarna (cu prepoziție zero!); VREME: Afară plouă/ninge/bate vântul; Este cald/rece/frig/plăcut; cerul este senin/înnorat; Ce zi este azi? / Ce dată este azi? / În ce lună suntem?; sărbători: Mărțișorul (1 mart.), Paștele, Ziua Națională (1 dec.), Crăciunul (25 dec.), Anul Nou (31 dec.); exercițiile 8-10 de la pp.16-17"},
      {id: "perfect-compus-a-fi", title: "Perfectul compus — «am fost»",
        goals: "FORMARE: auxiliar a avea + participiu; eu am fost / n-am fost; tu ai fost / n-ai fost; el/ea a fost / n-a fost; noi am fost / n-am fost; voi ați fost / n-ați fost; ei/ele au fost / n-au fost; Când ai fost la Brașov? — Săptămâna trecută. / Luna trecută. / Anul trecut.; Cu cine ai fost? / Cu ce ai fost? — Cu trenul / cu mașina; Ai fost la...? — Da, am fost. / Nu, n-am fost.; exercițiul 11 de la pp.19-20"},
      {id: "a-avea-contact", title: "Verbul «a avea» și datele de contact",
        goals: "TABEL: eu am / n-am; tu ai / n-ai; el/ea are / n-are; noi avem / n-avem; voi aveți / n-aveți; ei/ele au / n-au; Câți ani ai? — Am 34 de ani. (regula 'de': 1-19 fără de, 20+ cu de); Când e ziua ta de naștere? — Pe 15 noiembrie.; Ce adresă ai? / Ce număr de telefon ai? / De când ești în România? — De un an. / De trei luni.; dialog model de la p.21"},
    ]},

  // ════════════════════════════════════════════════════════════════════
  // A1 — Unitatea 2  (manual pp. 23-30)
  // Sala de curs + articolul nedefinit + prepoziții
  // ════════════════════════════════════════════════════════════════════

  {id: "u2-sala", emoji: "🏫", label: "U2 · Sala de curs și articole", level: "a1",
    textbookRef: "Anna Borca pp. 23-30",
    modules: [
      {id: "obiecte-un-o-niste", title: "Obiecte în sală — un / o / niște",
        goals: "ARTICOL NEDEFINIT: un (masc./neutru singular), o (feminin singular), niște (orice plural); vocabular sală: un laptop, o carte, un scaun, o fereastră, un rucsac, o tablă, un pix, un caiet, un creion, o radieră, un dicționar, un dulap, un coș de gunoi; Ce este pe masă? → Pe masă nu este nimic.; Cine este în sală? → În sală nu este nimeni.; exercițiile 1-3 de la pp.23-25"},
      {id: "a-avea-nevoie", title: "«A avea nevoie de» și orarul cursurilor",
        goals: "Cine are nevoie de un pix? → Eu am nevoie de un pix.; Ai nevoie de ceva? → Nu, n-am nevoie de nimic.; a avea timp pentru o cafea / pentru o întâlnire / pentru o petrecere; ORAR: cursul este de la 18:30 până la 20:30; cursuri de luni până vineri; din septembrie până în octombrie; dialog complet cu Andrei și Tomas (p.27); exercițiile 4-7 de la pp.25-27"},
      {id: "prepozitii-oras", title: "Prepoziții și orientare în oraș",
        goals: "în + loc închis (în clasă, în cutie, în parc); la + destinație/loc (la cinema, la birou, la piață); pe + suprafață (pe masă, pe stradă, pe Calea Victoriei); lângă = next to; pentru + infinitiv (pentru a scrie, pentru a cumpăra); în+un=într-un, în+o=într-o; BUCUREȘTI: Piața Universității, Calea Victoriei, centrul vechi, Parcul Cișmigiu; mulți/puțini (masc.) vs multe/puține (fem.); exercițiile 8-9 de la pp.28-30"},
    ]},

  // ════════════════════════════════════════════════════════════════════
  // A1 — Unitatea 3  (manual pp. 31-45)
  // Profesii + substantivul (gen+număr) + casa
  // ════════════════════════════════════════════════════════════════════

  {id: "u3-profesii", emoji: "💼", label: "U3 · Profesii și verbul «a lucra»", level: "a1",
    textbookRef: "Anna Borca pp. 31-36",
    modules: [
      {id: "profesii-complete", title: "Lista completă de profesii",
        goals: "PROFESII cu gen: avocat/avocată, arhitect/arhitectă, profesor/profesoară, doctor/doctoriță, chelner/chelneriță, jurnalist/jurnalistă, polițist/polițistă, frizer/frizeriță, taximetrist/taximetristă, fotograf/fotografă, director/directoare; Ce ești? → Sunt avocat. / Sunt avocată.; exercițiul 3 de la p.35: mini-biografie (Mă numesc X. Am Y ani. Sunt Z. Lucrez la...)"},
      {id: "a-lucra", title: "Verbul «a lucra» și locul de muncă",
        goals: "CONJUGARE verbele în -ez: eu lucrez, tu lucrezi, el/ea lucrează, noi lucrăm, voi lucrați, ei/ele lucrează; Unde lucrezi? — La o firmă / la un birou de avocatură / la un ziar / la un spital / la British Council; De când lucrezi acolo? — De trei ani. / De un an.; Câte ore lucrezi pe zi? — 8 ore, de luni până vineri.; dialog complet p.31 (Ion și Juan); exercițiile 4-6 de la pp.35-36"},
      {id: "carte-vizita", title: "Carte de vizită — dialog de prezentare complet",
        goals: "dialog complet în perechi (p.35 model): Cum te numești? / Câți ani ai? / De când ești în România? / Lucrezi aici? / De când lucrezi acolo?; elemente de pe o carte de vizită: nume, profesie, număr de telefon, e-mail, adresă, pagină web; exercițiul 6 de la p.36: citește 4 cărți de vizită și răspunde la întrebări"},
    ]},

  {id: "u3-substantiv", emoji: "📚", label: "U3 · Genul și numărul substantivelor", level: "a1",
    textbookRef: "Anna Borca pp. 32-40",
    modules: [
      {id: "gen-masc-fem", title: "Masculin vs feminin — reguli și excepții",
        goals: "MASCULIN singular → plural: -t/-n/-st/-or → +i (student→studenți, avocat→avocați, profesor→profesori, director→directori); EXCEPȚII -e: frate→frați, câine→câini, perete→pereți, munte→munți; FEMININ: -ă → -e (doamnă→doamne, profesoară→profesoare, colegă→colege, mamă→mame); -ă → -i (lampă→lămpi, stradă→străzi, geantă→genți, mătușă→mătuși); nu există substantiv feminin terminat în consoană; exercițiile 2A-2B de la pp.32-34"},
      {id: "gen-neutru", title: "Genul neutru — «un» la singular, «niște» la plural",
        goals: "NEUTRU: comportă ca masculin la singular, ca feminin la plural; în consoană → -e (autobuz→autobuze, avion→avioane, oraș→orașe, dicționar→dicționare, scaun→scaune, restaurant→restaurante); -u → -e (exemplu→exemple, teatru→teatre, muzeu→muzee, liceu→licee); -iu → -ii (exercițiu→exerciții, fotoliu→fotolii, salariu→salarii); excepții -uri: curs→cursuri, dulap→dulapuri, birou→birouri, ceas→ceasuri; exercițiile 7-10 de la pp.37-40"},
      {id: "plural-feminin-special", title: "Pluralul feminin — formele speciale",
        goals: "-ie → -ii: bucătărie→bucătării, farfurie→farfurii, familie→familii, farmacie→farmacii, lecție→lecții, librărie→librării; -ie → -i: femeie→femei, foaie→foi, lămâie→lămâi, cheie→chei; -ea → -ele: cafea→cafele, canapea→canapele, perdea→perdele; -a/-ua → -ale: sarma→sarmale, baclava→baclavale, cafea→cafele; -e → -i: bere→beri, pâine→pâini, floare→flori, carte→cărți; exercițiile 7-8 de la pp.37-38"},
    ]},

  {id: "u3-casa", emoji: "🏠", label: "U3 · Casa — camere și mobilă", level: "a1",
    textbookRef: "Anna Borca pp. 41-45",
    modules: [
      {id: "a-sta-locuinta", title: "Verbul «a sta» — locuința ta",
        goals: "CONJUGARE: eu stau, tu stai, el/ea stă, noi stăm, voi stați, ei/ele stau; Unde stai la București? — Stau aproape de Parcul Herăstrău.; Stai într-o casă sau într-un apartament? (în+un=într-un, în+o=într-o); La ce etaj stai? — La etajul patru / la parter / la mansardă / la subsol; De cât timp stai la București? — De o jumătate de an.; aproape de ≠ departe de; dialog complet pp.41-42"},
      {id: "camere-mobila", title: "Camerele casei și mobila",
        goals: "CAMERE: dormitor, cameră de zi/sufragerie, bucătărie, baie, hol, birou; MOBILĂ: pat, comodă, noptieră, canapea, fotoliu, masă, scaune, dulap, bibliotecă, frigider, aragaz, cuptor cu microunde, mașină de spălat, televizor; prepoziții de loc: pe pat, în dulap, lângă lampă, pe perete; In ce cameră se află: patul? aragazul? cada de baie?; exercițiile 13-16 de la pp.42-45"},
      {id: "descrie-casa", title: "Descrie-ți casa — dialog complet",
        goals: "Câte camere are apartamentul/casa? / La ce etaj? / Stai aproape sau departe de centru? / Pe ce stradă?; adjective pentru casă: luminos/luminoasă, mare/mică, modern/modernă, vechi/veche, confortabil/confortabilă; camera ta preferată și de ce; dialog model p.45 — exersează cu tutorul descriind locuința ta reală"},
    ]},

  // ════════════════════════════════════════════════════════════════════
  // A2 — Unitatea 4  (manual pp. 46-60)  +  teme practice extratextbook
  // ════════════════════════════════════════════════════════════════════

  {id: "u4-piata-verbe", emoji: "🛒", label: "U4 · La piață — verbe noi", level: "a2",
    textbookRef: "Anna Borca pp. 46-54",
    modules: [
      {id: "legume-fructe-piata", title: "Legume, fructe și dialog la piață",
        goals: "LEGUME: cartofi, roșii, ardei, castraveți, ceapă, morcov, vânătă/vinete, varză, conopidă; FRUCTE: mere, prune, pere, struguri, căpșune, zmeură, pepene roșu, portocale, cireșe, prune; CANTITĂȚI: un kilogram de..., o jumătate de kilogram, o jumătate de...; VERBUL A VREA: eu vreau, tu vrei, el/ea vrea, noi vrem, voi vreți, ei/ele vor; dialog la piață (ex.2 p.47): Ce vrei de la piață? → Vreau trei kilograme de cartofi..."},
      {id: "a-lua-a-face-a-merge", title: "Verbele a lua / a face / a merge",
        goals: "A LUA (neregulat): eu iau, tu iei, el/ea ia, noi luăm, voi luați, ei/ele iau; A FACE (neregulat): eu fac, tu faci, el/ea face, noi facem, voi faceți, ei/ele fac; A MERGE: eu merg, tu mergi, el/ea merge, noi mergem, voi mergeți, ei/ele merg; de obicei (=usually), uneori (=sometimes), niciodată (=never); Iau micul dejun la 8. / Fac sport zilnic. / Merg la piață cu bicicleta.; exercițiile 3-4 de la pp.48-49 și 10B de la pp.53-54"},
      {id: "art-definit", title: "Articolul definit — -ul / -le / -a / -ua",
        goals: "ARTICOL DEFINIT SINGULAR: masculin/neutru în consoană → -ul (domn→domnul, prieten→prietenul, pahar→paharul); masc./neutru în -e → -le (frate→fratele, președinte→președintele); feminin -ă → -a (doamnă→doamna, prietenă→prietena, casă→casa); feminin -ea → -ua (cafea→cafeaua, sarma→sarmaua); DEFINIT PLURAL: masc.→-i+i (prieteni→prietenii), fem.→-le (doamne→doamnele), neutru→-le (mere→merele); regula: la/în/lângă/pentru + FĂRĂ articol definit; exercițiile 9-10A de la pp.52-53"},
    ]},

  {id: "u4-restaurant", emoji: "🍽️", label: "U4 · La restaurant — a mânca, a plăcea", level: "a2",
    textbookRef: "Anna Borca pp. 55-60",
    modules: [
      {id: "a-manca-a-bea", title: "A mânca, a bea și mesele zilei",
        goals: "A MÂNCA (neregulat): eu mănânc, tu mănânci, el/ea mănâncă, noi mâncăm, voi mâncați, ei/ele mănâncă; A BEA (neregulat): eu beau, tu bei, el/ea bea, noi bem, voi beți, ei/ele beau; MESELE: micul dejun / prânzul / cina; Ce mănânci la micul dejun? — Mănânc o omletă și beau o cafea.; Mi-e foame → Vreau să mănânc ceva.; Mi-e sete → Vreau să beau ceva.; vocabular: ou fiert, pâine prăjită, sandvici, cereale, suc proaspăt, iaurt; exercițiile 3 și 5 de la pp.48, 50"},
      {id: "a-placea-opinii", title: "«Îmi place / îmi plac» — preferințe",
        goals: "STRUCTURĂ: îmi place + substantiv singular definit (Îmi place cafeaua.); îmi plac + substantiv plural definit (Îmi plac sarmalele.); îmi place + să + verb (Îmi place să beau cafea.); persoanele: îmi/ți/îi/ne/vă/le; MÂNCĂRURI ROMÂNEȘTI: sarmale în foi de varză cu mămăligă, mămăligă cu brânză și smântână, papanași, păstrăv la grătar, clătite cu dulceață de vișine, salată de vinete, ciorbă; Poftă bună! / Să vă fie de bine!; exercițiile 12-14 de la pp.57-58"},
      {id: "a-dori-restaurant", title: "La restaurant — rezervare și comandă",
        goals: "A DORI (condițional): eu aș dori, tu ai dori, el/ea ar dori, noi am dori, voi ați dori, ei/ele ar dori; Aș dori o masă pentru trei persoane.; Pentru când și la ce oră? — Pentru sâmbătă seara, la șapte și jumătate.; Pe ce nume? — Alexandru Ionescu.; CU + mijloc transport: cu tramvaiul, cu autobuzul, cu metroul, cu taxiul, cu bicicleta, pe jos; tot/toată/toți/toate + articol definit; exercițiul 11 de la pp.55-56"},
    ]},

  {id: "rutina", emoji: "⏰", label: "Rutina zilnică — verbe reflexive", level: "a2",
    modules: [
      {id: "dimineata", title: "Dimineața — verbe reflexive",
        goals: "REFLEXIVE: mă trezesc, mă spăl, mă îmbrac, mă pieptăn, mă machiez, mă bărbieresc; La ce oră te trezești? — Mă trezesc la 7.; înainte de (before), după (after)"},
      {id: "program-zi", title: "Programul zilei",
        goals: "lucrez de la 9 la 17; iau prânzul la birou/în oraș; în pauzele de la serviciu; conectori: mai întâi/prima dată, apoi, după aceea, la urmă"},
      {id: "weekend-activitati", title: "Ce fac în weekend",
        goals: "verbe: merg la cinema/la teatru/la restaurant, citesc, fac sport, mă plimb, stau de vorbă cu prietenii; frecvență: de obicei, uneori, niciodată, rar, des"},
    ]},

  {id: "cumparaturi-haine", emoji: "🛍️", label: "La cumpărături și haine", level: "a2",
    modules: [
      {id: "la-magazin", title: "La magazin — prețuri și articol definit",
        goals: "Cât costă...? (+ articol definit); Aș dori... (condițional); Este scump/ieftin.; Am nevoie de un bon fiscal.; prețuri cu 'de': 50 de lei, 200 de lei"},
      {id: "haine-marimi", title: "Haine și mărimi",
        goals: "haine: un tricou, o rochie, o pereche de pantofi/pantaloni, un pulover, o geacă; Ce mărime purtați? — Mărimea M / 40.; culori cu acord (un tricou roșu / o rochie roșie)"},
      {id: "reclamatii", title: "Returnări și reclamații",
        goals: "Vreau să returnez...; Este defect/prea mic/prea mare.; Am bonul fiscal.; politeță: Mi-ar plăcea să... / Aș putea să...?"},
    ]},

  {id: "directii-transport", emoji: "🗺️", label: "Direcții și transport public", level: "a2",
    modules: [
      {id: "cum-ajung", title: "Cum ajung la...?",
        goals: "IMPERATIV: Mergeți drept! / Întoarceți la stânga/dreapta! / Treceți strada!; repere: la semafor, după colț, vizavi de, în față la; La ce stație cobor?"},
      {id: "transport-public", title: "Transport public — bilete și stații",
        goals: "metrou/autobuz/tramvai/troleibuz; Cât costă un bilet?; Unde se ia biletul?; Cu ce mergi la serviciu? — Cu metroul / pe jos.; De la ce oră circulă?"},
      {id: "taxi-orientare", title: "Taxi și orientare în București",
        goals: "La adresa..., vă rog.; Cât va dura? / Cât costă aproximativ?; Puteți opri aici?; cartierele Bucureștiului; aproape de / departe de / lângă / vizavi de"},
    ]},

  {id: "povestiri-trecut", emoji: "📜", label: "Povești la trecut — perfectul compus", level: "a2",
    modules: [
      {id: "p-compus-verbe", title: "Perfectul compus cu verbe diverse",
        goals: "formare: aux. a avea + participiu; participii: mâncat, băut, mers, văzut, cumpărat, lucrat, citit, scris, fost, făcut, luat, vorbit; am mâncat, ai băut, a mers, am văzut..."},
      {id: "ieri-saptamana", title: "Ieri și săptămâna trecută",
        goals: "Ieri am... / Săptămâna trecută am...; Ce ai făcut în weekend? — Am fost la cinema cu...; conectori temporali: mai întâi, apoi, după aceea, la urmă, în final"},
      {id: "o-calatorie", title: "Povestește o călătorie",
        goals: "Unde ai fost? / Când? / Cu cine? / Cum ai ajuns? (cu trenul/avionul) / Ce ai văzut? / Cum a fost?; 5-7 propoziții coerente; Mi-a plăcut mult pentru că... / N-a fost ce mă așteptam pentru că..."},
    ]},

  // ════════════════════════════════════════════════════════════════════
  // B1 — Toward the Certificatul de competență lingvistică B1
  // ════════════════════════════════════════════════════════════════════

  {id: "b1-munca", emoji: "💼", label: "B1 · Muncă și carieră", level: "b1",
    modules: [
      {id: "descriere-job", title: "Descrie-ți jobul",
        goals: "Mă ocup de... / Sunt responsabil/ă de...; vocabular: ședințe, proiecte, clienți, colegi, termene limită; Câte ore lucrezi pe zi?; viitor simplu (voi lucra, va fi, vom face...)"},
      {id: "interviu-job", title: "La un interviu de angajare",
        goals: "Vorbește-mi despre tine.; Care sunt punctele tale forte/slabe?; De ce vrei să lucrezi la noi?; Ai experiență în...?; răspunsuri de 4-5 propoziții"},
      {id: "planuri-cariera", title: "Planuri de carieră",
        goals: "viitor simplu: voi/vei/va/vom/veți/vor; Aș vrea să... / Mi-ar plăcea să...; Peste 5 ani voi fi...; conectori: în primul rând, în al doilea rând, în concluzie"},
    ]},

  {id: "b1-sanatate", emoji: "🏥", label: "B1 · Sănătate", level: "b1",
    modules: [
      {id: "simptome", title: "Descrierea simptomelor",
        goals: "Mă doare capul/stomacul/gâtul; Am febră / tuse / răceală; De cât timp? — De două zile.; scara durerii: puțin, moderat, mult, foarte mult; corp: cap, gât, piept, spate, stomac, brațe, picioare"},
      {id: "la-doctor", title: "La doctor",
        goals: "Luați un comprimat de trei ori pe zi.; Aveți rețetă?; Ce simptome aveți?; De când?; Fiți atent la...; Am alergie la..."},
      {id: "la-farmacie", title: "La farmacie",
        goals: "Fără rețetă / cu rețetă.; Aveți ceva pentru dureri de cap?; Care sunt efectele secundare?; dozaj: o dată/de două ori pe zi, înainte/după masă"},
    ]},

  {id: "b1-timp-liber", emoji: "🎬", label: "B1 · Timp liber și opinii", level: "b1",
    modules: [
      {id: "hobby-pasiuni", title: "Hobby-uri și pasiuni",
        goals: "Mă pasionează... / Îmi place foarte mult să...; Practic... de X ani.; verbe: citesc, pictez, cânt la..., fac sport, gătesc, călătoresc; Cât timp dedici hobby-ului tău?"},
      {id: "film-carte-opinie", title: "Despre un film sau o carte",
        goals: "Am văzut/citit recent...; Subiectul este...; Cel mai mult mi-a plăcut... pentru că...; Recomand / Nu recomand pentru că...; structură: introducere → rezumat scurt → opinie personală"},
      {id: "argumentare-simpla", title: "Argumentare — «Eu cred că...»",
        goals: "Eu cred că... / După părerea mea... / Din punctul meu de vedere...; conectori B1: pentru că, deoarece, de aceea, totuși, în schimb, pe de altă parte; structură: poziție → 2 argumente → exemplu → concluzie"},
    ]},

  {id: "b1-sarbatori", emoji: "🎉", label: "B1 · Sărbători și tradiții", level: "b1",
    modules: [
      {id: "sarbatori-ro", title: "Sărbători românești",
        goals: "Crăciun (25 dec.) — cozonac, colinde, brad; Paștele — cozonac, ouă roșii, miel; Mărțișorul (1 mart.) — simbol primăverii; Ziua Națională (1 dec.); Ce fac românii de Crăciun/Paște?"},
      {id: "sarbatori-il", title: "Sărbători israeliene — explică în română",
        goals: "explică Roș Hașana, Kippur, Pesah, Hanuka cuiva care nu le cunoaște; vocabular explicativ: este o sărbătoare când..., se mănâncă..., se obișnuiește să..."},
      {id: "comparatie-culturi", title: "Compararea tradițiilor",
        goals: "Pe de o parte... pe de altă parte...; Similar cu... dar diferit prin...; În Israel obișnuim să..., în timp ce în România...; concluzie culturală de 2-3 propoziții"},
    ]},

  // ── Exam simulation & free practice ─────────────────────────────────
  {id: "examen-oral-b1", emoji: "🎓", label: "Simulare examen oral B1", level: "b1",
    modules: [
      {id: "interviu-examen", title: "Interviu de examen — 5 minute",
        goals: "FORMATE STANDARD B1: prezentare personală (2 min); descriere familie/job/rutină; planuri de viitor; răspunsuri de minimum 3-4 propoziții; fără ezitări lungi; examinatorul: tutor joacă rolul examinatorului oficial"},
      {id: "descriere-imagine", title: "Descrierea unei imagini — 2 minute",
        goals: "STRUCTURĂ: În imagine văd... (general) → Detalii: în stânga/dreapta/în centru... → Probabil / Se pare că... (interpretare) → Opinia ta (1 propoziție); vocabular spațial: în prim-plan, în fundal, în stânga, în dreapta, în centru"},
      {id: "argumentare-examen", title: "Pro/contra — 3 minute",
        goals: "STRUCTURĂ OBLIGATORIE: 1) Enunți poziția (20 sec); 2) Argument PRO + exemplu (1 min); 3) Argument CONTRA + răspuns (1 min); 4) Concluzie (20 sec); conectori obligatorii: în primul rând, în al doilea rând, totuși, în concluzie; teme tipice B1: tehnologia în educație, munca de acasă, viața la oraș vs sat"},
    ]},

  {id: "conversatie", emoji: "💬", label: "Conversație liberă", level: "b1", modules: null},
];

// ── The registry ──────────────────────────────────────────────────────
const COURSES = [
  {
    id: "en-general",
    targetLang: "en",
    targetLangLabel: "English",
    targetLangEmoji: "🇬🇧",
    scaffoldLang: "none",
    level: "all",
    examPrep: null,
    voicePresets: ["coral", "ash", "sage", "shimmer", "verse"],
    themes: EN_THEMES,
    featureId: null, // always available
  },
  {
    id: "ro-b1-he",
    targetLang: "ro",
    targetLangLabel: "Romanian",
    targetLangEmoji: "🇷🇴",
    scaffoldLang: "he",
    level: "all",                 // the course spans A1 → B1
    startFromZero: true,          // student assumed to be a total beginner
    assumedStartingLevel: "a0",
    examTargetLevel: "b1",
    examPrep: {
      code: "B1",
      name: "Romanian B1 Certificate (Certificatul de competență lingvistică)",
      focus: [
        "build from zero to B1",
        "oral interview (final)",
        "describing daily life and past experiences",
        "structured argumentation pro/contra",
        "B1 vocabulary — prefer everyday useful words",
      ],
    },
    voicePresets: ["coral", "sage", "verse", "shimmer"],
    themes: RO_B1_THEMES,
    featureId: "cap.tutorRomanian",
  },
];

const COURSES_BY_ID = Object.fromEntries(COURSES.map((c) => [c.id, c]));

function getCourse(id) {
  return COURSES_BY_ID[id] || COURSES_BY_ID["en-general"];
}

function getThemeFromCourse(course, themeId) {
  return (course.themes || []).find((t) => t.id === themeId) || null;
}

function getModuleFromTheme(theme, moduleId) {
  return theme && Array.isArray(theme.modules) ? theme.modules.find((m) => m.id === moduleId) || null : null;
}

module.exports = {COURSES, COURSES_BY_ID, getCourse, getThemeFromCourse, getModuleFromTheme};
