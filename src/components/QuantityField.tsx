import { useId } from "react";

export default function QuantityField({
  label,
  unit,
  value,
  onChange,
  autoFocus,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="qty-row">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="qty-unit">{unit}</span>
      </div>
    </div>
  );
}
