export interface RecognitionStatusInput {
  matchedStudent: { name: string; confidence: number } | null;
  isLoading: boolean;
  isReady: boolean;
  isFaceDetected: boolean;
  isAnalyzing?: boolean;
}

export function getRecognitionStatusText({
  matchedStudent,
  isLoading,
  isReady,
  isFaceDetected,
  isAnalyzing,
}: RecognitionStatusInput): string {
  if (matchedStudent) {
    const pct = Math.round(matchedStudent.confidence * 100);
    return `Verified: ${matchedStudent.name} (${pct}% match)`;
  }

  if (isLoading) {
    return 'Recognition: Loading';
  }

  if (isReady && isFaceDetected) {
    if (isAnalyzing) {
      return 'Face detected · Analyzing identity…';
    }
    return 'Face detected · Unregistered person';
  }

  if (isFaceDetected) {
    return 'Face detected · Ready';
  }

  return 'Ready · Waiting for face';
}
