
-- Seed notices
INSERT INTO public.notices (title, content, is_pinned, author_id) VALUES
('NEET 2026 Batch Schedule Released', 'Hi students! The complete NEET 2026 revision batch schedule is now live. Classes begin from June 1, 2026. Check the Courses section for full timetable.', true, 'cd60d033-0724-4935-968f-7f2d8f811de4'),
('New Knowledge Project Lessons Added', 'Free Knowledge Project course has been updated with new chapters and lessons. Enroll now — zero cost!', false, 'cd60d033-0724-4935-968f-7f2d8f811de4');

-- Seed chapter + lessons for Knowledge Project (course 34)
WITH ch AS (
  INSERT INTO public.chapters (course_id, code, title, description, position)
  VALUES (34, 'KP-CH1', 'Introduction to Knowledge Project', 'Welcome chapter covering basics and roadmap', 0)
  RETURNING id
)
INSERT INTO public.lessons (course_id, chapter_id, title, description, video_url, youtube_id, lecture_type, position, duration)
SELECT 34, ch.id, t.title, t.description, t.video_url, t.youtube_id, 'VIDEO', t.position, t.duration
FROM ch, (VALUES
  ('Welcome & Course Overview', 'Get started with the Knowledge Project: what to expect and how to learn.', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ', 0, 300),
  ('Foundation Concepts', 'Core foundational ideas every learner should know.', 'https://www.youtube.com/watch?v=9bZkp7q19f0', '9bZkp7q19f0', 1, 600),
  ('Building Strong Study Habits', 'Practical tips to develop daily study discipline.', 'https://www.youtube.com/watch?v=kJQP7kiw5Fk', 'kJQP7kiw5Fk', 2, 480)
) AS t(title, description, video_url, youtube_id, position, duration);

-- Seed sample quiz with 5 questions for course 34
WITH q AS (
  INSERT INTO public.quizzes (title, description, type, course_id, duration_minutes, total_marks, pass_percentage, is_published, created_by)
  VALUES ('Knowledge Project — Starter Quiz', 'A quick 5-question quiz to test foundational concepts.', 'dpp', 34, 10, 20, 40, true, 'cd60d033-0724-4935-968f-7f2d8f811de4')
  RETURNING id
)
INSERT INTO public.questions (quiz_id, question_text, question_type, options, correct_answer, explanation, marks, order_index)
SELECT q.id, t.qt, 'mcq', t.opts::jsonb, t.ans, t.exp, 4, t.idx
FROM q, (VALUES
  ('What is the primary goal of the Knowledge Project?', '["Pass exams","Build lifelong learning habits","Memorize facts","Get certificates"]', 'Build lifelong learning habits', 'The course focuses on sustainable learning, not rote memorization.', 0),
  ('Which study technique is most effective for long-term retention?', '["Cramming","Spaced repetition","Highlighting","Re-reading"]', 'Spaced repetition', 'Spaced repetition leverages the spacing effect for memory.', 1),
  ('Active recall means:', '["Reading aloud","Testing yourself without notes","Watching videos","Group study"]', 'Testing yourself without notes', 'Active recall strengthens memory through retrieval practice.', 2),
  ('Pomodoro technique uses intervals of:', '["10 min","25 min","45 min","60 min"]', '25 min', 'Standard Pomodoro is 25 minutes of focus + 5 min break.', 3),
  ('Best time to review notes is:', '["Never","Same day, then spaced","Only before exams","Once a month"]', 'Same day, then spaced', 'Reviewing same-day then at spaced intervals maximizes retention.', 4)
) AS t(qt, opts, ans, exp, idx);
