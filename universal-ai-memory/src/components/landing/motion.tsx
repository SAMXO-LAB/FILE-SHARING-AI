"use client";
import { motion, MotionConfig, type Variants } from "framer-motion";

/**
 * Shared animation building blocks for the landing page. MotionConfig("user") turns every animation
 * into an instant change when the visitor's device asks for reduced motion.
 */
export function LandingMotion({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

const ease = [0.2, 0.8, 0.2, 1] as const;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease } },
};

export const stagger = (gap = 0.08, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: gap, delayChildren: delay } },
});

/** Fades and lifts its children in when scrolled into view (once). */
export function Reveal({ children, className, delay = 0, as = "div" }: { children: React.ReactNode; className?: string; delay?: number; as?: "div" | "section" | "li" | "header" }) {
  const C = motion[as];
  return (
    <C className={className} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }} variants={{ hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { duration: 0.55, ease, delay } } }}>
      {children}
    </C>
  );
}

/** A group whose direct <Item> children animate in one after another. */
export function Stagger({ children, className, gap = 0.08, as = "div" }: { children: React.ReactNode; className?: string; gap?: number; as?: "div" | "ul" | "ol" }) {
  const C = motion[as];
  return (
    <C className={className} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} variants={stagger(gap)}>
      {children}
    </C>
  );
}

export function Item({ children, className, as = "div" }: { children: React.ReactNode; className?: string; as?: "div" | "li" }) {
  const C = motion[as];
  return <C className={className} variants={fadeUp}>{children}</C>;
}
