// Fixed agent->colour map taken from docs/mockup.html so the known personas
// keep their established hues. Unknown agent_ids fall back to a deterministic
// hash hue so the rail still distinguishes them.
const FIXED: Record<string, string> = {
  empiricist: "#4f9eff",
  rationalist: "#c084fc",
  precautionary: "#38d9c4",
  accelerationist: "#ffb547",
  deontologist: "#51cf66",
  consequentialist: "#ff6b6b",
  contrarian: "#f472b6",
  strawman: "#94a3b8",
  moderator: "#ec4899",
};

const FALLBACK_HUES = [200, 30, 280, 130, 0, 50, 320, 180];

export function hueFor(agentId: string): number {
  let h = 0;
  for (let i = 0; i < agentId.length; i++) h = ((h << 5) - h + agentId.charCodeAt(i)) | 0;
  return FALLBACK_HUES[Math.abs(h) % FALLBACK_HUES.length];
}

export function roleColor(agentId: string): string {
  const fixed = FIXED[agentId.toLowerCase()];
  if (fixed) return fixed;
  return `hsl(${hueFor(agentId)} 70% 55%)`;
}

export function roleName(agentId: string): string {
  if (!agentId) return agentId;
  return agentId.charAt(0).toUpperCase() + agentId.slice(1);
}
