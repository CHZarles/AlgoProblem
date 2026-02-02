import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "../../lib/cn";

export type DropdownOption = { value: string; label: string };

export function DropdownSelect({
  value,
  options,
  onChange,
  className,
  buttonClassName,
  contentClassName,
  align = "start",
  placeholder,
}: {
  value: string;
  options: DropdownOption[];
  onChange: (next: string) => void;
  className?: string;
  buttonClassName?: string;
  contentClassName?: string;
  align?: "start" | "center" | "end";
  placeholder?: string;
}) {
  const current = options.find((o) => o.value === value)?.label ?? placeholder ?? value;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-lg px-3 text-sm",
            "bg-white/6 text-slate-200 hover:bg-white/9",
            "shadow-[0_0_0_1px_rgba(148,163,184,0.14)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40",
            buttonClassName,
            className,
          )}
        >
          <span className="truncate font-medium">{current}</span>
          <ChevronsUpDown className="h-4 w-4 text-slate-400" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          sideOffset={8}
          align={align}
          className={cn(
            "min-w-[12rem] rounded-xl bg-[#0F1520] p-1 shadow-[0_0_0_1px_rgba(148,163,184,0.14)] shadow-panel",
            contentClassName,
          )}
        >
          {options.map((o) => {
            const selected = o.value === value;
            return (
              <DropdownMenu.Item
                key={o.value}
                onSelect={() => onChange(o.value)}
                className={cn(
                  "flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm outline-none",
                  "text-slate-200 data-[highlighted]:bg-white/6 data-[highlighted]:text-slate-50",
                  selected && "bg-white/4",
                )}
              >
                <span className="font-medium">{o.label}</span>
                {selected ? <Check className="h-4 w-4 text-sky-500" /> : null}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

