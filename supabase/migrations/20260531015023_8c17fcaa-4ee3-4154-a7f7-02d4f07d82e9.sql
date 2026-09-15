INSERT INTO public.knowledge_base (title, category, keywords, content, position, is_active)
SELECT * FROM (VALUES
  ('RAG Course - L1: Introduction to Retrieval Augmented Generation','course_material',
   ARRAY['RAG','retrieval augmented generation','LLM','agentic RAG','vector database','DeepLearning.AI'],
   E'RAG (Retrieval Augmented Generation) sabse widely used technique hai LLM responses ki quality improve karne ke liye. Core idea: Classical search systems + LLM reasoning abilities ka combination. Design choices (chunk size, retrieval method) accuracy aur speed ko bahut affect karte hain.\n\nKey Concepts: Data preparation, LLM prompting, User traffic evaluation, Agentic RAG (Multiple LLMs handling workflow parts).\n\nApplications: Healthcare (medical questions), Education (tutoring), Enterprise (internal policies), Customer Service.\n\nCourse by DeepLearning.AI, Instructor: Zan Hassan (Weaviate, Together AI).',
   100, true),
  ('RAG Course - L2: Module 1 Blueprint - Building RAG Systems','course_material',
   ARRAY['RAG','module 1','retriever','knowledge base','vector database','programming'],
   E'RAG System Building - Module 1 Blueprint:\n- Main components: LLM + Retriever + Knowledge Base\n- Retriever helps LLM find relevant info from trusted knowledge base\n- Progression: Simple RAG → Robust Retriever → Vector Database → Advanced LLM → Monitoring & Evaluation\n\nModule 1: High-level RAG intro, Architecture deep dive, Production examples, Hands-on programming assignment.',
   101, true),
  ('RAG Course - L3: How RAG Works - Retrieval and Generation','course_material',
   ARRAY['RAG','retrieval','generation','augmented prompt','hallucination','knowledge base'],
   E'RAG 2 phases mein kaam karta hai:\n1) Retrieval - Information collect karna\n2) Generation - Reasoning + Response\n\nAugmented prompt = Original question + Retrieved documents.\n\nFayde: Hallucination reduction, Easy updates (just update KB), Source citations, Division of labor.\n\nKey insight: "Just put the information in the prompt" - RAG modifies prompt before sending to LLM.',
   102, true),
  ('RAG Course - L4: RAG Real-World Applications','course_material',
   ARRAY['RAG','applications','code generation','chatbot','healthcare','legal','web search'],
   E'RAG Applications:\n1. Code Generation - Repository as knowledge base\n2. Enterprise Chatbots - Products, policies, inventory\n3. Healthcare & Legal - Medical journals, legal documents\n4. AI Web Search - Internet as knowledge base\n5. Personal Assistants - Emails, calendar, context-aware tasks\n\nKey: Jab bhi info LLM training mein nahi, RAG useful hai.',
   103, true),
  ('RAG Course - L5: RAG Architecture Deep Dive','course_material',
   ARRAY['RAG','architecture','retriever','context window','citations','augmented prompt'],
   E'RAG Architecture Flow:\nUser Prompt → Retriever → KB Query → Retrieved Docs → Augmented Prompt → LLM → Response\n\nAdvantages:\n1. Information access (beyond training data)\n2. Hallucination reduction (grounded responses)\n3. Easy updates (update KB = instant LLM update)\n4. Source citations\n5. Division of labor (retriever = facts, LLM = text)\n\nLimitations: Longer prompts = more cost, Context window limits.',
   104, true),
  ('RAG Course - L6: Understanding LLMs - Tokens, Probability & Hallucinations','course_material',
   ARRAY['LLM','tokens','probability','hallucination','autoregressive','context window','training'],
   E'LLM = "fancy autocomplete" - next word predict karta hai.\n\nTokens & Generation:\n- Words → Tokens (some words = multiple tokens)\n- Vocabulary: 10K to 100K+ tokens\n- Process: Analyze text → Probability for every token → Sample next\n- Autoregressive: Each token choice influences future choices\n\nHallucinations: LLM generates PROBABLE text, not TRUTHFUL text. RAG solution: Add relevant info to context → grounded responses.\n\nContext Window: Older models = few thousand tokens, Newer = millions. Longer prompts = more computation.',
   105, true),
  ('RAG Course - Complete Syllabus & Overview','course_material',
   ARRAY['RAG','course','syllabus','DeepLearning.AI','modules','overview'],
   E'RAG Course Syllabus (DeepLearning.AI):\n\n1. RAG Overview - Introduction, concepts\n2. Information Retrieval & Search Foundation\n3. Information Retrieval with Vector Database\n4. LLM and Text Generation\n5. RAG System in Production\n\nCore Skills: Data preparation, LLM prompting, Retriever design, Vector DB integration, Production monitoring, Chunk size optimization, Agentic RAG workflows.',
   106, true)
) AS v(title, category, keywords, content, position, is_active)
WHERE NOT EXISTS (
  SELECT 1 FROM public.knowledge_base kb WHERE kb.title = v.title
);