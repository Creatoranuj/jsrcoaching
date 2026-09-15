import { createClient } from "npm:@supabase/supabase-js@2";
import { requireRole } from "../_shared/auth.ts";
import { errorResponse, internalError } from "../_shared/errors.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const gate = await requireRole(req, corsHeaders, ['admin']);
  if (!gate.ok) return gate.response;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const entries = [
    {
      title: "RAG Course - L1: Introduction to Retrieval Augmented Generation",
      category: "course_material",
      keywords: ["RAG", "retrieval augmented generation", "LLM", "agentic RAG", "vector database", "DeepLearning.AI"],
      content: `RAG (Retrieval Augmented Generation) sabse widely used technique hai LLM responses ki quality improve karne ke liye. Core idea: Classical search systems + LLM reasoning abilities ka combination. Design choices (chunk size, retrieval method) accuracy aur speed ko bahut affect karte hain.\n\nKey Concepts: Data preparation, LLM prompting, User traffic evaluation, Agentic RAG (Multiple LLMs handling workflow parts).\n\nApplications: Healthcare (medical questions), Education (tutoring), Enterprise (internal policies), Customer Service.\n\nCourse by DeepLearning.AI, Instructor: Zan Hassan (Weaviate, Together AI).`,
      position: 100, is_active: true
    },
    {
      title: "RAG Course - L2: Module 1 Blueprint - Building RAG Systems",
      category: "course_material",
      keywords: ["RAG", "module 1", "retriever", "knowledge base", "vector database", "programming"],
      content: `RAG System Building - Module 1 Blueprint:\n- Main components: LLM + Retriever + Knowledge Base\n- Retriever helps LLM find relevant info from trusted knowledge base\n- Progression: Simple RAG → Robust Retriever → Vector Database → Advanced LLM → Monitoring & Evaluation\n\nModule 1: High-level RAG intro, Architecture deep dive, Production examples, Hands-on programming assignment.`,
      position: 101, is_active: true
    },
    {
      title: "RAG Course - L3: How RAG Works - Retrieval and Generation",
      category: "course_material",
      keywords: ["RAG", "retrieval", "generation", "augmented prompt", "hallucination", "knowledge base"],
      content: `RAG 2 phases mein kaam karta hai:\n1) Retrieval - Information collect karna\n2) Generation - Reasoning + Response\n\nAugmented prompt = Original question + Retrieved documents.\n\nFayde: Hallucination reduction, Easy updates (just update KB), Source citations, Division of labor.\n\nKey insight: "Just put the information in the prompt" - RAG modifies prompt before sending to LLM.`,
      position: 102, is_active: true
    },
    {
      title: "RAG Course - L4: RAG Real-World Applications",
      category: "course_material",
      keywords: ["RAG", "applications", "code generation", "chatbot", "healthcare", "legal", "web search"],
      content: `RAG Applications:\n1. Code Generation - Repository as knowledge base\n2. Enterprise Chatbots - Products, policies, inventory\n3. Healthcare & Legal - Medical journals, legal documents\n4. AI Web Search - Internet as knowledge base\n5. Personal Assistants - Emails, calendar, context-aware tasks\n\nKey: Jab bhi info LLM training mein nahi, RAG useful hai.`,
      position: 103, is_active: true
    },
    {
      title: "RAG Course - L5: RAG Architecture Deep Dive",
      category: "course_material",
      keywords: ["RAG", "architecture", "retriever", "context window", "citations", "augmented prompt"],
      content: `RAG Architecture Flow:\nUser Prompt → Retriever → KB Query → Retrieved Docs → Augmented Prompt → LLM → Response\n\nAdvantages:\n1. Information access (beyond training data)\n2. Hallucination reduction (grounded responses)\n3. Easy updates (update KB = instant LLM update)\n4. Source citations\n5. Division of labor (retriever = facts, LLM = text)\n\nLimitations: Longer prompts = more cost, Context window limits.`,
      position: 104, is_active: true
    },
    {
      title: "RAG Course - L6: Understanding LLMs - Tokens, Probability & Hallucinations",
      category: "course_material",
      keywords: ["LLM", "tokens", "probability", "hallucination", "autoregressive", "context window", "training"],
      content: `LLM = "fancy autocomplete" - next word predict karta hai.\n\nTokens & Generation:\n- Words → Tokens (some words = multiple tokens)\n- Vocabulary: 10K to 100K+ tokens\n- Process: Analyze text → Probability for every token → Sample next\n- Autoregressive: Each token choice influences future choices\n\nHallucinations: LLM generates PROBABLE text, not TRUTHFUL text. RAG solution: Add relevant info to context → grounded responses.\n\nContext Window: Older models = few thousand tokens, Newer = millions. Longer prompts = more computation.`,
      position: 105, is_active: true
    },
    {
      title: "RAG Course - Complete Syllabus & Overview",
      category: "course_material",
      keywords: ["RAG", "course", "syllabus", "DeepLearning.AI", "modules", "overview"],
      content: `RAG Course Syllabus (DeepLearning.AI):\n\n1. RAG Overview - Introduction, concepts\n2. Information Retrieval & Search Foundation\n3. Information Retrieval with Vector Database\n4. LLM and Text Generation\n5. RAG System in Production\n\nCore Skills: Data preparation, LLM prompting, Retriever design, Vector DB integration, Production monitoring, Chunk size optimization, Agentic RAG workflows.`,
      position: 106, is_active: true
    }
  ];

  try {
    // Check if already seeded
    const { data: existing } = await supabase
      .from('knowledge_base')
      .select('id')
      .eq('category', 'course_material')
      .ilike('title', '%RAG Course%')
      .limit(1);

    if (existing && existing.length > 0) {
      return new Response(JSON.stringify({ message: 'RAG course content already exists', count: existing.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data, error } = await supabase.from('knowledge_base').insert(entries).select('id');
    if (error) throw error;

    return new Response(JSON.stringify({ success: true, inserted: data?.length || 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return internalError(err, corsHeaders, "seed-knowledge");
  }
});
