"use client";

import { MotionConfig } from "motion/react";
import HeroSection from "@/components/features/landing/hero-section";

export default function LandingPage() {
  return (
    <MotionConfig reducedMotion="user">
      <HeroSection />
    </MotionConfig>
  );
}
