// Exam track config — drives batch cards on landing + exam-specific SEO pages.
// Static for now; move to Supabase when real batch data is ready.

export type ExamTrackSlug = "up-board" | "cbse" | "cg-lecturer" | "spoken-english";

export interface ExamTrack {
  slug: ExamTrackSlug;
  route?: string; // dedicated landing route (SEO)
  badge: string;
  title: string;
  faculty: string;
  language: string;
  duration: string;
  startDate: string;
  seats: string | null;
  priceMrp?: number;
  priceEffective?: number;
  short: string;
  hero: {
    h1: string;
    subtitle: string;
    metaTitle: string;
    metaDescription: string;
  };
  syllabus: { chapter: string; topics: string[] }[];
  includes: string[];
  faqs: { q: string; a: string }[];
}

export const examTracks: ExamTrack[] = [
  {
    slug: "up-board",
    route: "/up-board-english",
    badge: "UP Board",
    title: "UP Board English — Class 9 to 12",
    faculty: "Ramchandra Sir",
    language: "Hindi medium friendly",
    duration: "9 months · 220+ lessons",
    startDate: "Naya batch: 5 Aug 2026",
    seats: "Limited seats",
    priceMrp: 2999,
    priceEffective: 999,
    short: "Prose, poetry, grammar aur writing skills — pura UP Board syllabus, chapter-wise.",
    hero: {
      h1: "UP Board English (Class 9–12) — Hindi Medium Prep",
      subtitle:
        "Ramchandra Sir ke saath UP Board English ki puri taiyari — prose, poetry, grammar, translation aur writing skills. Chapter-wise videos, PDF notes aur weekly tests.",
      metaTitle: "UP Board English (Class 9–12) — JSR COACHING by Ramchandra Sir",
      metaDescription:
        "UP Board English Class 9 se 12 tak — Hindi medium ke liye chapter-wise video lessons, PDF notes, weekly tests aur doubt support. Free demo aaj shuru karein.",
    },
    syllabus: [
      { chapter: "Prose", topics: ["The Enchanted Pool", "My Financial Career", "The Home Coming", "Character of a Happy Life"] },
      { chapter: "Poetry", topics: ["Stopping by Woods", "The Nightingale and the Glow-Worm", "The Ballad of Father Gilligan"] },
      { chapter: "Grammar", topics: ["Tenses", "Voice", "Narration", "Modal Auxiliaries", "Transformation of Sentences"] },
      { chapter: "Writing Skills", topics: ["Essay", "Letter Writing", "Paragraph", "Report Writing"] },
      { chapter: "Translation", topics: ["Hindi → English", "Common patterns", "Board previous year"] },
    ],
    includes: [
      "220+ recorded video lessons in Hindi",
      "Chapter-wise PDF notes aur summaries",
      "Weekly mock tests + previous year papers",
      "Live doubt-clearing session har Sunday",
      "WhatsApp community for daily practice",
    ],
    faqs: [
      { q: "Ye batch kis class ke liye hai?", a: "Class 9, 10, 11 aur 12 — sab UP Board English syllabus cover hota hai." },
      { q: "Kya videos Hindi mein hain?", a: "Haan, poori explanation Hindi medium ke students ke liye hai. English concepts ko Hindi mein samjhaya jata hai." },
      { q: "Kya PDF notes milte hain?", a: "Har chapter ke saath free PDF notes milte hain — download aur offline read kar sakte ho." },
      { q: "Live doubt kaise clear hote hain?", a: "Har Sunday live doubt session hota hai + WhatsApp community 24×7 active hai." },
      { q: "Kya free demo mil sakta hai?", a: "Haan — signup ke baad first chapter completely free hai. Try karein, tab decide karein." },
    ],
  },
  {
    slug: "cbse",
    route: "/cbse-english",
    badge: "CBSE",
    title: "CBSE English — Grammar & Writing",
    faculty: "Ramchandra Sir",
    language: "Hindi + English",
    duration: "10 weeks · 72 lessons",
    startDate: "Naya batch: 12 Aug 2026",
    seats: "40 seats left",
    priceMrp: 1999,
    priceEffective: 799,
    short: "Grammar, reading comprehension aur board-pattern answer writing — chapter-wise practice.",
    hero: {
      h1: "CBSE English — Grammar, Comprehension & Writing Skills",
      subtitle:
        "CBSE English board ki taiyari — grammar rules, unseen passages, notice, letter, article aur creative writing. Chapter-wise videos + weekly writing feedback.",
      metaTitle: "CBSE English — Grammar, Writing & Comprehension | JSR COACHING",
      metaDescription:
        "CBSE English (Class 9–12) ke liye focused prep — grammar, unseen passage, notice, letter, article writing. Weekly tests + writing feedback ke saath.",
    },
    syllabus: [
      { chapter: "Reading", topics: ["Unseen Passage", "Note Making", "Summary Writing"] },
      { chapter: "Writing", topics: ["Notice", "Letter (Formal + Informal)", "Article", "Report"] },
      { chapter: "Grammar", topics: ["Tenses", "Modals", "Determiners", "Reported Speech", "Editing & Omission"] },
      { chapter: "Literature", topics: ["Prose chapters", "Poetry", "Supplementary reader"] },
    ],
    includes: [
      "72 recorded lessons — board-pattern focus",
      "Sample papers aur previous year solved",
      "Weekly writing task with personal feedback",
      "Live grammar Q&A har Wednesday",
      "PDF notes + formula sheet",
    ],
    faqs: [
      { q: "Kya ye Class 10 aur 12 dono ke liye hai?", a: "Haan — grammar aur writing sab classes ke liye common hai, literature chapter-wise organize hai." },
      { q: "Writing tasks pe feedback kaun deta hai?", a: "Ramchandra Sir aur team weekly writing pe personal feedback dete hain." },
      { q: "Kya CBSE sample papers milte hain?", a: "Haan, latest sample papers + last 5 years ka solved paper included hai." },
      { q: "Language kya hai?", a: "Explanation Hindi mein, examples aur answers English mein — bilingual approach." },
      { q: "Free demo kaise le?", a: "Signup karke Grammar ka first chapter free access kar sakte ho." },
    ],
  },
  {
    slug: "cg-lecturer",
    route: "/cg-lecturer-english",
    badge: "CG Lecturer",
    title: "CG Lecturer English — Full Prep",
    faculty: "Ramchandra Sir",
    language: "Hindi + English",
    duration: "16 weeks · 120+ lessons",
    startDate: "Naya batch: 20 Aug 2026",
    seats: "60 seats",
    priceMrp: 4999,
    priceEffective: 1499,
    short: "Chhattisgarh Lecturer English paper — literature, linguistics, methodology aur previous year papers.",
    hero: {
      h1: "CG Lecturer English — Complete Preparation with PYQ",
      subtitle:
        "Chhattisgarh Lecturer English paper ki poori tayyari — literature history, linguistics, teaching methodology aur last 10 years ke previous year questions.",
      metaTitle: "CG Lecturer English — Full Prep + PYQ | JSR COACHING",
      metaDescription:
        "CG Lecturer English paper ke liye complete course — literature, linguistics, methodology, aur 10 years ke PYQ. Weekly mock + doubt sessions Ramchandra Sir ke saath.",
    },
    syllabus: [
      { chapter: "English Literature", topics: ["Chaucer to Modern Age", "Major poets & novelists", "Shakespeare"] },
      { chapter: "Linguistics", topics: ["Phonetics", "Morphology", "Syntax", "Semantics"] },
      { chapter: "Teaching Methodology", topics: ["Approaches", "Lesson planning", "Evaluation"] },
      { chapter: "Grammar & Composition", topics: ["Advanced grammar", "Comprehension", "Essay"] },
      { chapter: "PYQ Practice", topics: ["Last 10 years solved", "Topic-wise", "Full-length mocks"] },
    ],
    includes: [
      "120+ lessons — full syllabus coverage",
      "Last 10 years PYQ solved + explained",
      "Weekly full-length mock test",
      "Live doubt session har Saturday",
      "Digital notes + printable formula sheet",
    ],
    faqs: [
      { q: "Kya syllabus latest CGPSC notification ke hisab se hai?", a: "Haan — 2024–2026 notification ke topics cover hain, updates milte rehte hain." },
      { q: "PYQ solutions detailed hain?", a: "Har PYQ ka detailed video + written solution milta hai." },
      { q: "Kya mock tests real exam pattern pe hain?", a: "Haan — question type, marking scheme aur time limit exam ke jaisa hi hai." },
      { q: "Doubts kaise pooch sakte hain?", a: "Har Saturday live doubt session, aur telegram group 24×7 active hai." },
      { q: "Free demo?", a: "Signup ke baad Literature ka first module aur ek PYQ solution free milta hai." },
    ],
  },
  {
    slug: "spoken-english",
    badge: "Spoken",
    title: "Spoken English & Interview Prep",
    faculty: "Ramchandra Sir",
    language: "Hindi medium friendly",
    duration: "8 weeks · 60 lessons",
    startDate: "Rolling admission",
    seats: null,
    priceMrp: 1499,
    priceEffective: 499,
    short: "Daily-use English, roleplay aur interview confidence — beginner se conversational fluency tak.",
    hero: {
      h1: "Spoken English & Interview Prep",
      subtitle: "Daily English speaking, roleplay aur interview confidence.",
      metaTitle: "Spoken English — JSR COACHING",
      metaDescription: "Practical spoken English aur interview prep — Hindi medium ke liye.",
    },
    syllabus: [],
    includes: [],
    faqs: [],
  },
];

export const examTrackBySlug = (slug: string): ExamTrack | undefined =>
  examTracks.find((t) => t.slug === slug);

export const examTrackByRoute = (route: string): ExamTrack | undefined =>
  examTracks.find((t) => t.route === route);
