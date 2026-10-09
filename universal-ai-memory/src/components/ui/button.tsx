import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[calc(var(--radius)*0.65)] text-sm font-medium transition-[background,transform,opacity,box-shadow] duration-150 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] select-none",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-fg shadow-[0_8px_24px_-10px_var(--accent)] hover:brightness-110",
        glass: "glass hover:bg-[rgb(var(--surface)/calc(var(--surface-a)+0.07))]",
        ghost: "hover:bg-[rgb(var(--surface)/calc(var(--surface-a)+0.04))] text-fg",
        outline: "border hairline hover:bg-[rgb(var(--surface)/calc(var(--surface-a)))]",
        danger: "bg-danger text-white hover:brightness-110",
        "danger-ghost": "text-danger hover:bg-danger/10",
      },
      size: { sm: "h-8 px-3", md: "h-10 px-4", lg: "h-12 px-6 text-base", icon: "h-10 w-10", "icon-sm": "h-8 w-8" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, loading, children, disabled, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {asChild ? children : (<>{loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{children}</>)}
    </Comp>
  );
});
Button.displayName = "Button";
export { buttonVariants };
