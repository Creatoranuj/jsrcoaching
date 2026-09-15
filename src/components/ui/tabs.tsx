// File: src/components/ui/tabs.tsx
"use client";

import * as React from "react";
import { cn } from "../../lib/utils";

const TabsContext = React.createContext<{
  activeTab: string;
  setActiveTab: (id: string) => void;
} | null>(null);

export const Tabs = ({ defaultValue, value, onValueChange, className, children }: { defaultValue?: string; value?: string; onValueChange?: (value: string) => void; className?: string; children: React.ReactNode }) => {
  const [internalTab, setInternalTab] = React.useState(defaultValue || "");
  const activeTab = value !== undefined ? value : internalTab;
  const setActiveTab = (id: string) => {
    if (onValueChange) onValueChange(id);
    else setInternalTab(id);
  };
  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className={cn("w-full", className)}>{children}</div>
    </TabsContext.Provider>
  );
};

export const TabsList = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    {...props}
    className={cn("inline-flex h-9 items-center justify-center rounded-full bg-muted p-1 text-muted-foreground", className)}
  >
    {children}
  </div>
));
TabsList.displayName = "TabsList";


export const TabsTrigger = ({
  value,
  children,
  className,
  onClick,
  ...props
}: { value: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) => {
  const context = React.useContext(TabsContext);
  if (!context) throw new Error("TabsTrigger must be used within Tabs");
  const isActive = context.activeTab === value;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      {...props}
      onClick={(e) => {
        onClick?.(e);
        context.setActiveTab(value);
      }}
      data-state={isActive ? "active" : "inactive"}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-full px-3 h-7 text-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        isActive
          ? "bg-background text-foreground font-medium shadow-[0_1px_2px_rgba(0,0,0,0.08),0_1px_1px_rgba(0,0,0,0.04)]"
          : "text-foreground/60 hover:text-foreground/80",
        className
      )}
    >
      {children}
    </button>

  );
};

export const TabsContent = React.forwardRef<HTMLDivElement, { value: string; children: React.ReactNode; className?: string }>(
  ({ value, children, className }, ref) => {
    const context = React.useContext(TabsContext);
    if (!context) throw new Error("TabsContent must be used within Tabs");
    if (context.activeTab !== value) return null;
    return (
      <div ref={ref} className={cn("mt-2 ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2 animate-in fade-in-0 zoom-in-95 duration-200", className)}>
        {children}
      </div>
    );
  }
);
TabsContent.displayName = "TabsContent";