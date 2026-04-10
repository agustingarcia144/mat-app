import { useMediaQuery } from "@/hooks/use-media-query";

export const MOBILE_BREAKPOINT = 768;
export const TABLET_BREAKPOINT = 1024;

export function useIsMobile(breakpoint = MOBILE_BREAKPOINT) {
  return useMediaQuery(`(max-width: ${breakpoint - 1}px)`);
}
