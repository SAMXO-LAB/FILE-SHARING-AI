import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[calc(var(--radius)*0.62)] text-sm font-medium transition-[background-color,border-color,color,transform,opacity,box-shadow] duration-150 ease-out disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] select-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-fg shadow-[0_1px_2px_rgb(15_23_42/0.08),0_4px_12px_-4px_color-mix(in_srgb,var(--accent)_45%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_88%,black)] active:bg-[color-mix(in_srgb,var(--accent)_80%,black)]",
        glass: "border hairline bg-card text-fg shadow-[var(--shadow-xs)] hover:border-[rgb(var(--line)/calc(var(--border-a)+0.08))] hover:bg-[color-mix(in_srgb,var(--card)_94%,var(--fg))]",
        ghost: "text-fg hover:bg-[rgb(var(--line)/0.055)]",
        outline: "border hairline text-fg hover:bg-[rgb(var(--line)/0.04)]",
        danger: "bg-danger text-white hover:bg-[color-mix(in_srgb,var(--danger)_88%,black)]",
        "danger-ghost": "text-danger hover:bg-danger/10",
      },
      size: { sm: "h-8 px-3 text-[13px]", md: "h-9 px-3.5", lg: "h-11 px-5 text-[15px]", icon: "h-9 w-9", "icon-sm": "h-8 w-8" },
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
