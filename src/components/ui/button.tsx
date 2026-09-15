import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";
import { tapHaptic } from "../../lib/native/haptics";

const buttonVariants = cva(
  // Soft-touch baseline (applied to every Button across the APK):
  //   - transition-all so the press-state transform animates
  //   - active:scale-[0.97] = sub-100ms visual press confirmation
  //   - duration-150 ease-out = Tailwind token (no arbitrary [Nms])
  //   - link/ghost-on-decorative override the scale below
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold ring-offset-background transition-all duration-150 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100 [&_svg]:pointer-events-none [&_svg]:size-[18px] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:shadow-md",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 hover:shadow-md active:scale-[0.96]",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        // Inline links should feel like text, not buttons — kill the press scale.
        link: "text-primary underline-offset-4 hover:underline active:scale-100 rounded-none",
      },
      size: {
        default: "h-11 px-5 py-2",
        sm: "h-10 rounded-lg px-4",
        lg: "h-12 rounded-xl px-6 text-base",
        icon: "h-11 w-11 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);


// Variant → haptic style. `link` is text-like; no haptic.
// Destructive gets a slightly stronger pulse so deletes feel deliberate.
const HAPTIC_BY_VARIANT: Record<string, "light" | "medium" | null> = {
  default: "light",
  destructive: "medium",
  outline: "light",
  secondary: "light",
  ghost: "light",
  link: null,
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Set false to opt out of the auto-haptic (e.g. inside fast scroll lists). */
  haptic?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, haptic = true, onClick, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    const handleClick = React.useCallback(
      (e: React.MouseEvent<HTMLButtonElement>) => {
        if (!disabled && haptic) {
          const style = HAPTIC_BY_VARIANT[variant ?? "default"];
          // Fire-and-forget — haptics wrapper swallows errors and no-ops on web.
          if (style) void tapHaptic(style);
        }
        onClick?.(e);
      },
      [disabled, haptic, variant, onClick],
    );

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        onClick={handleClick}
        disabled={disabled}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
