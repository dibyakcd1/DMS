
import { useState, useEffect } from "react";

export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
} as const;

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkIsMobile = () => setIsMobile(window.innerWidth < BREAKPOINTS.md);
    checkIsMobile();
    window.addEventListener("resize", checkIsMobile);
    return () => window.removeEventListener("resize", checkIsMobile);
  }, []);

  return isMobile;
}

export function useIsTablet() {
  const [isTablet, setIsTablet] = useState(false);

  useEffect(() => {
    const checkIsTablet = () => {
      setIsTablet(window.innerWidth >= BREAKPOINTS.md && window.innerWidth < BREAKPOINTS.lg);
    };
    checkIsTablet();
    window.addEventListener("resize", checkIsTablet);
    return () => window.removeEventListener("resize", checkIsTablet);
  }, []);

  return isTablet;
}

export function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const checkIsDesktop = () => setIsDesktop(window.innerWidth >= BREAKPOINTS.lg);
    checkIsDesktop();
    window.addEventListener("resize", checkIsDesktop);
    return () => window.removeEventListener("resize", checkIsDesktop);
  }, []);

  return isDesktop;
}

export function useIsLaptop() {
  const [isLaptop, setIsLaptop] = useState(false);

  useEffect(() => {
    const checkIsLaptop = () => {
      setIsLaptop(window.innerWidth >= BREAKPOINTS.lg && window.innerWidth < BREAKPOINTS.xl);
    };
    checkIsLaptop();
    window.addEventListener("resize", checkIsLaptop);
    return () => window.removeEventListener("resize", checkIsLaptop);
  }, []);

  return isLaptop;
}

export function useIsCompact() {
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    const checkIsCompact = () => setIsCompact(window.innerWidth < BREAKPOINTS.lg);
    checkIsCompact();
    window.addEventListener("resize", checkIsCompact);
    return () => window.removeEventListener("resize", checkIsCompact);
  }, []);

  return isCompact;
}

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    if (media.matches !== matches) {
      setMatches(media.matches);
    }
    const listener = () => setMatches(media.matches);
    window.addEventListener("resize", listener);
    return () => window.removeEventListener("resize", listener);
  }, [matches, query]);

  return matches;
}

export function useBreakpoint() {
  const [breakpoint, setBreakpoint] = useState<keyof typeof BREAKPOINTS | "base">("base");

  useEffect(() => {
    const checkBreakpoint = () => {
      const width = window.innerWidth;
      if (width >= BREAKPOINTS["2xl"]) setBreakpoint("2xl");
      else if (width >= BREAKPOINTS.xl) setBreakpoint("xl");
      else if (width >= BREAKPOINTS.lg) setBreakpoint("lg");
      else if (width >= BREAKPOINTS.md) setBreakpoint("md");
      else if (width >= BREAKPOINTS.sm) setBreakpoint("sm");
      else setBreakpoint("base");
    };
    checkBreakpoint();
    window.addEventListener("resize", checkBreakpoint);
    return () => window.removeEventListener("resize", checkBreakpoint);
  }, []);

  return breakpoint;
}
