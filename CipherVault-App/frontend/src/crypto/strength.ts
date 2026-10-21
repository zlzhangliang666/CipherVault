interface ScoreResult {
  score: number; // 0..4
  label: string;
}

export function scorePassword(pw: string): ScoreResult {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 14) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;

  // check repeat
  const unique = new Set(pw);
  if (unique.size < pw.length * 0.5) score = Math.max(1, score - 1);

  const capped = Math.min(4, Math.floor(score * 0.8));
  const labels = ['非常弱', '弱', '中等', '强', '非常强'];
  return { score: capped, label: labels[capped] };
}