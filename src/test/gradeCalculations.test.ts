import { describe, it, expect } from 'vitest';
import {
  computeFinalRating,
  getGradeRemark,
  computeGeneralAverage,
  validateQuarterGrade,
} from '@/features/grades/lib/gradeCalculations';

describe('DepEd Grade Calculations (DepEd Order No. 8, s. 2015)', () => {
  describe('computeFinalRating', () => {
    it('returns null (Incomplete) when any quarter is missing or null', () => {
      expect(computeFinalRating(85, 88, 90, null)).toBeNull();
      expect(computeFinalRating(85, undefined, 90, 89)).toBeNull();
      expect(computeFinalRating(null, null, null, null)).toBeNull();
      expect(computeFinalRating(80, 82, 85, NaN)).toBeNull();
    });

    it('computes exact average and rounds to nearest whole number per DepEd convention', () => {
      // 88 + 89 + 91 + 92 = 360 / 4 = 90
      expect(computeFinalRating(88, 89, 91, 92)).toBe(90);

      // 74 + 75 + 75 + 75 = 299 / 4 = 74.75 -> rounds to 75
      expect(computeFinalRating(74, 75, 75, 75)).toBe(75);

      // 74 + 74 + 75 + 75 = 298 / 4 = 74.5 -> rounds to 75
      expect(computeFinalRating(74, 74, 75, 75)).toBe(75);

      // 74 + 74 + 74 + 75 = 297 / 4 = 74.25 -> rounds to 74
      expect(computeFinalRating(74, 74, 74, 75)).toBe(74);
    });
  });

  describe('getGradeRemark', () => {
    it('returns Passed for final ratings >= 75', () => {
      expect(getGradeRemark(75)).toBe('Passed');
      expect(getGradeRemark(90)).toBe('Passed');
      expect(getGradeRemark(100)).toBe('Passed');
    });

    it('returns Failed for final ratings < 75', () => {
      expect(getGradeRemark(74)).toBe('Failed');
      expect(getGradeRemark(60)).toBe('Failed');
      expect(getGradeRemark(70)).toBe('Failed');
    });

    it('returns Incomplete for null ratings', () => {
      expect(getGradeRemark(null)).toBe('Incomplete');
    });
  });

  describe('computeGeneralAverage', () => {
    it('returns null if any subject final rating is missing when requireAll is true', () => {
      const subjectRatings = [90, 88, 85, null, 92];
      expect(computeGeneralAverage(subjectRatings, true)).toBeNull();
    });

    it('computes general average of available subjects when requireAll is false', () => {
      const subjectRatings = [90, 88, 85, null, 92];
      // (90 + 88 + 85 + 92) / 4 = 355 / 4 = 88.75 -> 89
      expect(computeGeneralAverage(subjectRatings, false)).toBe(89);
    });

    it('computes rounded whole number average across all completed subjects', () => {
      const subjectRatings = [85, 87, 88, 90, 92, 89];
      // Sum = 531 / 6 = 88.5 -> 89
      expect(computeGeneralAverage(subjectRatings)).toBe(89);
    });

    it('returns null for empty array', () => {
      expect(computeGeneralAverage([])).toBeNull();
    });
  });

  describe('validateQuarterGrade', () => {
    it('accepts empty string, null, or undefined as valid draft input', () => {
      expect(validateQuarterGrade('')).toEqual({ isValid: true });
      expect(validateQuarterGrade(null)).toEqual({ isValid: true });
      expect(validateQuarterGrade(undefined)).toEqual({ isValid: true });
    });

    it('validates grades within DepEd 60 to 100 range', () => {
      expect(validateQuarterGrade(60)).toEqual({ isValid: true });
      expect(validateQuarterGrade(75)).toEqual({ isValid: true });
      expect(validateQuarterGrade(100)).toEqual({ isValid: true });
      expect(validateQuarterGrade('88.5')).toEqual({ isValid: true });
    });

    it('rejects grades below floor 60 or above ceiling 100', () => {
      expect(validateQuarterGrade(59).isValid).toBe(false);
      expect(validateQuarterGrade(101).isValid).toBe(false);
      expect(validateQuarterGrade(-5).isValid).toBe(false);
    });

    it('rejects non-numeric values', () => {
      expect(validateQuarterGrade('abc').isValid).toBe(false);
    });
  });
});
