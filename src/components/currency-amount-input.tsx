"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Currency } from "@/types";
import {
  currencyPrefix,
  formatCurrencyInput,
  parseCurrencyInput,
} from "@/lib/currency-input";

type CurrencyAmountInputProps = {
  name?: string;
  currency?: Currency;
  defaultValue?: number;
  value?: number;
  onValueChange?: (majorAmount: number) => void;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
  /** Allow empty optional fields (simulator). */
  allowEmpty?: boolean;
};

/**
 * Amount input with live Rupiah/EUR grouping (Rp 1.000.000).
 * Hidden input stores major units for form posts.
 */
export function CurrencyAmountInput({
  name,
  currency = "IDR",
  defaultValue,
  value,
  onValueChange,
  required,
  disabled,
  placeholder,
  className,
  id,
  allowEmpty = false,
}: CurrencyAmountInputProps) {
  const controlled = value !== undefined;
  const initial = controlled ? value : (defaultValue ?? 0);
  const [display, setDisplay] = useState(() =>
    initial ? formatCurrencyInput(initial, currency) : ""
  );
  const [major, setMajor] = useState(() => initial);

  useEffect(() => {
    if (!controlled) return;
    setMajor(value);
    setDisplay(value ? formatCurrencyInput(value, currency) : "");
  }, [controlled, value, currency]);

  function handleChange(raw: string) {
    if (allowEmpty && raw.trim() === "") {
      setMajor(0);
      setDisplay("");
      onValueChange?.(0);
      return;
    }
    const next = parseCurrencyInput(raw, currency);
    setMajor(next);
    setDisplay(formatCurrencyInput(next, currency));
    onValueChange?.(next);
  }

  return (
    <div className={cn("relative", className)}>
      <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm font-medium text-muted-foreground">
        {currencyPrefix(currency)}
      </span>
      <Input
        id={id}
        type="text"
        inputMode={currency === "IDR" ? "numeric" : "decimal"}
        className="pl-9 font-mono tabular-nums"
        value={display}
        onChange={(e) => handleChange(e.target.value)}
        required={required ? !display : false}
        disabled={disabled}
        placeholder={
          placeholder ?? (currency === "IDR" ? "1.000.000" : "10,50")
        }
        autoComplete="off"
      />
      {name ? (
        <input type="hidden" name={name} value={display ? String(major) : ""} />
      ) : null}
    </div>
  );
}
