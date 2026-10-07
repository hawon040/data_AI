import type { SafetyGrade } from "./types";

export const SAFETY_GRADES: SafetyGrade[] = [1, 2, 3, 4, 5];

export const SAFETY_GRADE_LABELS: Record<SafetyGrade, string> = {
  1: "매우 안전",
  2: "안전",
  3: "보통",
  4: "주의",
  5: "안전하지 않음",
};

export function isSafetyGrade(grade: number): grade is SafetyGrade {
  return Number.isInteger(grade) && grade >= 1 && grade <= 5;
}

export function safetyGradeLabel(grade: SafetyGrade): string {
  return `등급 ${grade} · ${SAFETY_GRADE_LABELS[grade]}`;
}
