/**
 * DepEd K-to-12 Grading System Calculation Utilities
 * DepEd Order No. 8, s. 2015 & Order No. 31, s. 2020:
 * - Quarterly grades are reported on a scale of 60 to 100.
 * - Passing mark is 75.
 * - Final rating is the average of the four quarters, rounded to a whole number.
 * - Final rating is only complete when all four quarters (Q1-Q4) are present.
 * - General Average is the average of final ratings across all learning areas.
 */

export const DEPED_PASSING_GRADE = 75;
export const MIN_GRADE_FLOOR = 60;
export const MAX_GRADE_CEILING = 100;

export type GradeRemark = 'Passed' | 'Failed' | 'Incomplete';

/**
 * Computes the DepEd Final Rating from Q1-Q4.
 * Returns the rounded whole number average if all 4 quarters are present, otherwise null (Incomplete).
 */
export function computeFinalRating(
  q1?: number | null,
  q2?: number | null,
  q3?: number | null,
  q4?: number | null
): number | null {
  if (
    q1 === undefined || q1 === null || isNaN(q1) ||
    q2 === undefined || q2 === null || isNaN(q2) ||
    q3 === undefined || q3 === null || isNaN(q3) ||
    q4 === undefined || q4 === null || isNaN(q4)
  ) {
    return null; // Incomplete
  }

  // DepEd whole number rounding convention
  const rawAverage = (q1 + q2 + q3 + q4) / 4;
  return Math.round(rawAverage);
}

/**
 * Returns 'Passed', 'Failed', or 'Incomplete' based on the computed final rating.
 */
export function getGradeRemark(finalRating: number | null): GradeRemark {
  if (finalRating === null || finalRating === undefined) {
    return 'Incomplete';
  }
  return finalRating >= DEPED_PASSING_GRADE ? 'Passed' : 'Failed';
}

/**
 * Computes General Average across all subjects.
 * Per DepEd convention, general average is the average of the final ratings of all subjects,
 * rounded to the nearest whole number. If any subject final rating is missing, returns null.
 */
export function computeGeneralAverage(
  subjectFinalRatings: (number | null | undefined)[],
  requireAll: boolean = true
): number | null {
  if (!subjectFinalRatings || subjectFinalRatings.length === 0) {
    return null;
  }

  const validRatings: number[] = [];

  for (const rating of subjectFinalRatings) {
    if (rating === null || rating === undefined || isNaN(rating)) {
      if (requireAll) return null; // Cannot finalize general average if any subject is incomplete
    } else {
      validRatings.push(rating);
    }
  }

  if (validRatings.length === 0) return null;

  const sum = validRatings.reduce((acc, curr) => acc + curr, 0);
  return Math.round(sum / validRatings.length);
}

/**
 * Validates a quarter grade entry.
 */
export function validateQuarterGrade(val: unknown): { isValid: boolean; error?: string } {
  if (val === '' || val === null || val === undefined) {
    return { isValid: true }; // Empty is valid draft state
  }

  const num = typeof val === 'number' ? val : parseFloat(String(val));
  if (isNaN(num)) {
    return { isValid: false, error: 'Grade must be a valid number' };
  }

  if (num < MIN_GRADE_FLOOR || num > MAX_GRADE_CEILING) {
    return { isValid: false, error: `Grade must be between ${MIN_GRADE_FLOOR} and ${MAX_GRADE_CEILING}` };
  }

  return { isValid: true };
}
