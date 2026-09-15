type LessonType = string | null | undefined;

type NoteLike = {
  kind?: string | null;
};

const STANDALONE_DOCUMENT_TYPES = new Set(["PDF", "NOTES", "DPP"]);

export function isStandaloneDocumentLesson(lessonType: LessonType): boolean {
  return STANDALONE_DOCUMENT_TYPES.has((lessonType || "").toUpperCase());
}

export function shouldAutoOpenSinglePdfNote(lessonType: LessonType, notes: NoteLike[]): boolean {
  return isStandaloneDocumentLesson(lessonType) && notes.length === 1 && notes[0]?.kind === "pdf";
}
