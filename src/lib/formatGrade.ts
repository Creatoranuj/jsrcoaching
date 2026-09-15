/**
 * Grades are stored inconsistently in the database — some rows read
 * "Class 12", others just "12", others "All". Prefixing blindly produces
 * labels like "Grade Class 12" / "(Class Class 12)".
 */
export function formatGrade(grade?: string | number | null, prefix = "Class"): string | null {
  if (!grade) return null;
  const value = String(grade).trim();
  if (!value) return null;
  if (/^(all|class|grade)\b/i.test(value)) return value;
  return `${prefix} ${value}`;
}
