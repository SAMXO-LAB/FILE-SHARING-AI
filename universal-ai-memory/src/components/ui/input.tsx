import * as React from "react";
import { cn } from "@/lib/utils";

const field = "w-full rounded-[calc(var(--radius)*0.6)] border hairline bg-card px-3.5 text-sm text-fg shadow-[var(--shadow-xs)] placeholder:text-subtle transition-[border-color,box-shadow] duration-150 focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-ring)] focus:outline-none focus-visible:outline-none disabled:opacity-60 aria-[invalid=true]:border-danger";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, type = "text", ...props }, ref) => (
  <input ref={ref} type={type} className={cn(field, "h-10", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(field, "min-h-24 py-2.5 leading-relaxed", className)} {...props} />
));
Textarea.displayName = "Textarea";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-[13px] font-medium text-fg", className)} {...props} />;
}

export function FieldError({ children, id }: { children?: React.ReactNode; id?: string }) {
  if (!children) return null;
  return <p id={id} role="alert" className="mt-1.5 text-sm text-danger">{children}</p>;
}

export function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-xs text-muted">{children}</p>;
}
