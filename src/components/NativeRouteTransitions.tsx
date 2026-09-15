import { type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

const getIsIOS = () => {
  const cap = (window as typeof window & { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  return cap?.getPlatform?.() === "ios";
};

const NativeRouteTransitions = ({ children, routeKey }: { children: ReactNode; routeKey: string }) => {
  const isIOS = getIsIOS();
  const variants = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  };

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={routeKey}
        initial={variants.initial}
        animate={variants.animate}
        exit={variants.exit}
        transition={{ duration: isIOS ? 0.25 : 0.15, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
};

export default NativeRouteTransitions;