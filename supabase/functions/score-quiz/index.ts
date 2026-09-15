import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { isAnswerCorrect } from "../_shared/quizAnswer.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Validate Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Create user client (to validate JWT) and service client (to read correct_answer)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    // 3. Validate JWT locally via getClaims (no server round-trip → no 401
    // when Supabase auth server has a stale session row).
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const { data: claimsData, error: authError } = await userClient.auth.getClaims(token);
    const userId = claimsData?.claims?.sub as string | undefined;
    if (authError || !userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Parse request body
    const { quiz_id, answers, time_taken_seconds } = await req.json() as {
      quiz_id: string;
      answers: Record<string, string>;
      time_taken_seconds: number;
    };

    if (!quiz_id || typeof answers !== "object") {
      return new Response(JSON.stringify({ error: "Missing quiz_id or answers" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Fetch quiz metadata (total_marks, pass_percentage) via service client
    const { data: quiz, error: quizError } = await serviceClient
      .from("quizzes")
      .select("id, total_marks, pass_percentage, course_id, created_by")
      .eq("id", quiz_id)
      .single();

    if (quizError || !quiz) {
      return new Response(JSON.stringify({ error: "Quiz not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5b. Enforce enrollment (or admin/teacher/owner). Prevents non-enrolled
    // students from scoring a paid course's quiz.
    const { data: roleRows } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const roles = new Set((roleRows ?? []).map((r: any) => r.role));
    const isStaff = roles.has("admin") || roles.has("teacher");
    const isOwner = quiz.created_by === userId;
    let isEnrolled = false;
    if (!isStaff && !isOwner && quiz.course_id != null) {
      const { data: enr } = await serviceClient
        .from("enrollments")
        .select("id")
        .eq("user_id", userId)
        .eq("course_id", quiz.course_id)
        .eq("status", "active")
        .maybeSingle();
      isEnrolled = !!enr;
    }
    if (!isStaff && !isOwner && quiz.course_id != null && !isEnrolled) {
      return new Response(JSON.stringify({ error: "Not enrolled in this course" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 6. Fetch full questions with correct_answer via service client
    const { data: questions, error: questionsError } = await serviceClient
      .from("questions")
      .select("id, correct_answer, marks, negative_marks, question_type, options")
      .eq("quiz_id", quiz_id);

    if (questionsError || !questions) {
      return new Response(JSON.stringify({ error: "Failed to fetch questions" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 7. Calculate score with negative marking (matcher handles MCQ index vs
    // option text, true/false casing, numerical parsing).
    let score = 0;
    for (const q of questions) {
      const userAnswer = answers[q.id];
      if (userAnswer === undefined || userAnswer === null || userAnswer === "") continue;
      const opts = Array.isArray((q as any).options)
        ? (q as any).options
        : ((q as any).options ? Object.values((q as any).options) : []);
      if (isAnswerCorrect(userAnswer, q.correct_answer, (q as any).question_type, opts as string[])) {
        score += q.marks ?? 4;
      } else {
        score -= q.negative_marks ?? 0;
      }
    }

    // 8. Calculate totals, clamp score minimum to 0
    const totalMarks = quiz.total_marks || questions.reduce((s: number, q: any) => s + (q.marks ?? 4), 0);
    score = Math.max(0, score);
    const percentage = totalMarks > 0 ? Math.round((score / totalMarks) * 100 * 100) / 100 : 0;
    const passed = percentage >= (quiz.pass_percentage ?? 40);

    // 9. Insert quiz_attempts row via service client
    const { data: attempt, error: insertError } = await serviceClient
      .from("quiz_attempts")
      .insert({
        user_id: userId,
        quiz_id,
        submitted_at: new Date().toISOString(),
        score,
        percentage,
        passed,
        answers,
        time_taken_seconds: time_taken_seconds ?? 0,
      })
      .select("id")
      .single();

    if (insertError || !attempt) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to save attempt" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 10. Return attempt_id + score summary
    return new Response(
      JSON.stringify({
        attempt_id: attempt.id,
        score,
        percentage,
        passed,
        total_marks: totalMarks,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("Unhandled error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
