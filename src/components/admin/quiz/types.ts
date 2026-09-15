export interface Quiz {
  id: string;
  title: string;
  type: string;
  is_published: boolean;
  total_marks: number;
  duration_minutes: number;
  pass_percentage: number;
  course_id: number | null;
  lesson_id: string | null;
  created_at: string;
  lessons?: { title: string } | null;
}

export interface QuestionForm {
  _uid: string;
  question_text: string;
  question_type: "mcq" | "true_false" | "numerical";
  options: string[];
  correct_answer: string;
  explanation: string;
  marks: number;
  negative_marks: number;
  image_url?: string;
  _imageFile?: File | null;
}

export const defaultQuestion = (): QuestionForm => ({
  _uid: crypto.randomUUID(),
  question_text: "",
  question_type: "mcq",
  options: ["", "", "", ""],
  correct_answer: "0",
  explanation: "",
  marks: 4,
  negative_marks: 1,
  image_url: "",
  _imageFile: null,
});