export const REWARD_ACCENT = "#FF5C24";
export const REWARD_ACCENT_DARK = "#F04E0E";
export const REWARD_BLUE = "#38BDF8";
export const REWARD_AMBER = "#F59E0B";
export const REWARD_SUCCESS = "#22C55E";

export function getRewardTheme(isDark: boolean) {
  return {
    background: isDark ? "#0A0A0A" : "#FAFAFA",
    surface: isDark ? "#18181B" : "#FFFFFF",
    surfaceRaised: isDark ? "#202024" : "#FFFFFF",
    text: isDark ? "#FAFAFA" : "#18181B",
    muted: isDark ? "#A1A1AA" : "#71717A",
    subtle: isDark ? "#71717A" : "#A1A1AA",
    border: isDark ? "#2C2C31" : "#E4E4E7",
    track: isDark ? "#3F3F46" : "#E4E4E7",
    orangeSoft: isDark ? "rgba(255,92,36,0.16)" : "#FFF0EA",
    blueSoft: isDark ? "rgba(56,189,248,0.15)" : "#E8F7FE",
    amberSoft: isDark ? "rgba(245,158,11,0.16)" : "#FFF7E5",
    greenSoft: isDark ? "rgba(34,197,94,0.16)" : "#EAF9EF",
    dangerSoft: isDark ? "rgba(239,68,68,0.16)" : "#FEF2F2",
  };
}
