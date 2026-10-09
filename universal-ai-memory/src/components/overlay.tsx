"use client";
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as SelectPrimitive from "@radix-ui/react-select";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

/* Dialog -------------------------------------------------------------------------------- */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({ className, children, title, description, hideClose, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { title: string; description?: string; hideClose?: boolean }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[var(--scrim)] backdrop-blur-[3px]" />
      <DialogPrimitive.Content
        className={cn("fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-[calc(var(--radius)*1.15)] border hairline bg-card p-6 shadow-[var(--shadow-lg)] animate-rise focus:outline-none", className)}
        {...props}
      >
        <div className="pr-8">
          <DialogPrimitive.Title className="text-[17px] font-semibold tracking-tight">{title}</DialogPrimitive.Title>
          {description ? <DialogPrimitive.Description className="mt-1 text-sm text-muted">{description}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>}
        </div>
        {children}
        {!hideClose && (
          <DialogPrimitive.Close className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:bg-[rgb(var(--line)/0.06)] hover:text-fg" aria-label="Close">
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/* Dropdown ------------------------------------------------------------------------------ */
export const DropdownMenu = DropdownPrimitive.Root;
export const DropdownMenuTrigger = DropdownPrimitive.Trigger;
export function DropdownMenuContent({ className, sideOffset = 6, ...props }: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content sideOffset={sideOffset} className={cn("glass-float z-50 min-w-48 overflow-hidden !rounded-[calc(var(--radius)*0.8)] p-1.5 animate-rise", className)} {...props} />
    </DropdownPrimitive.Portal>
  );
}
export function DropdownMenuItem({ className, danger, ...props }: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Item> & { danger?: boolean }) {
  return (
    <DropdownPrimitive.Item
      className={cn("flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-[rgb(var(--line)/0.06)] [&_svg]:text-muted", danger && "text-danger", className)}
      {...props}
    />
  );
}
export const DropdownMenuSeparator = ({ className }: { className?: string }) => <DropdownPrimitive.Separator className={cn("my-1 h-px bg-[rgb(var(--line)/0.08)]", className)} />;
export const DropdownMenuLabel = ({ children }: { children: React.ReactNode }) => <DropdownPrimitive.Label className="truncate px-2.5 py-1.5 text-xs text-muted">{children}</DropdownPrimitive.Label>;

/* Tabs ---------------------------------------------------------------------------------- */
/** `min-w-0 max-w-full` lets a long tab row scroll inside its own box instead of widening the page on phones. */
export function Tabs({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root className={cn("min-w-0 max-w-full", className)} {...props} />;
}
export function TabsList({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("no-scrollbar inline-flex max-w-full gap-0.5 overflow-x-auto rounded-[calc(var(--radius)*0.7)] border hairline bg-[rgb(var(--line)/0.035)] p-1", className)} {...props} />;
}
export function TabsTrigger({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn("inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[calc(var(--radius)*0.48)] px-3 text-[13px] font-medium text-muted transition-[background-color,color,box-shadow] duration-150 hover:text-fg data-[state=active]:bg-card data-[state=active]:text-fg data-[state=active]:shadow-[var(--shadow-sm)] data-[state=active]:[&_svg]:text-accent", className)}
      {...props}
    />
  );
}
export const TabsContent = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) => <TabsPrimitive.Content className={cn("mt-5 focus:outline-none", className)} {...props} />;

/* Switch -------------------------------------------------------------------------------- */
export function Switch({ className, ...props }: React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root className={cn("relative h-6 w-11 shrink-0 rounded-full border border-transparent bg-[rgb(var(--line)/0.16)] transition-colors duration-150 data-[state=checked]:bg-accent disabled:opacity-50", className)} {...props}>
      <SwitchPrimitive.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow-[0_1px_3px_rgb(15_23_42/0.25)] transition-transform duration-150 data-[state=checked]:translate-x-[21px]" />
    </SwitchPrimitive.Root>
  );
}

/* Select -------------------------------------------------------------------------------- */
export function Select({ value, onValueChange, options, placeholder, className, id, "aria-label": ariaLabel }: { value: string; onValueChange: (v: string) => void; options: { value: string; label: string }[]; placeholder?: string; className?: string; id?: string; "aria-label"?: string }) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger id={id} aria-label={ariaLabel} className={cn("inline-flex h-10 w-full items-center justify-between gap-2 rounded-[calc(var(--radius)*0.6)] border hairline bg-card px-3.5 text-sm shadow-[var(--shadow-xs)] focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-ring)] focus:outline-none", className)}>
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon><ChevronDown className="h-4 w-4 text-muted" /></SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content position="popper" sideOffset={6} className="glass-float z-[60] max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden !rounded-[calc(var(--radius)*0.8)] p-1.5">
          <SelectPrimitive.Viewport>
            {options.map((o) => (
              <SelectPrimitive.Item key={o.value} value={o.value} className="relative flex cursor-pointer select-none items-center rounded-lg py-2 pl-8 pr-3 text-sm outline-none data-[highlighted]:bg-[rgb(var(--line)/0.06)] data-[state=checked]:text-accent">
                <SelectPrimitive.ItemIndicator className="absolute left-2"><Check className="h-4 w-4" /></SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

/* Tooltip ------------------------------------------------------------------------------- */
export const TooltipProvider = TooltipPrimitive.Provider;
export function Tooltip({ label, children, side = "right" }: { label: string; children: React.ReactNode; side?: "top" | "right" | "bottom" | "left" }) {
  return (
    <TooltipPrimitive.Root delayDuration={250}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} sideOffset={8} className="z-[70] rounded-lg bg-[#0f172a] px-2.5 py-1.5 text-xs font-medium text-white shadow-[var(--shadow-md)] dark:bg-[#e2e8f0] dark:text-[#0f172a]">{label}</TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
