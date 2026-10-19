import { type ComponentProps, useId } from 'react';
import { type Control, type FieldPath, type FieldValues, useController } from 'react-hook-form';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type FormTextFieldProps<T extends FieldValues> = Omit<
  ComponentProps<'input'>,
  'value' | 'onChange' | 'onBlur' | 'name'
> & {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
};

/** react-hook-form field rendered with shadcn Input + Label; shows the zod message on error. */
export function FormTextField<T extends FieldValues>({
  control,
  name,
  label,
  ...inputProps
}: FormTextFieldProps<T>) {
  const id = useId();
  const {
    field: { ref, value, onChange, onBlur },
    fieldState: { error },
  } = useController({ control, name });

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        ref={ref}
        name={name}
        value={value ?? ''}
        onChange={onChange}
        onBlur={onBlur}
        aria-invalid={error !== undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...inputProps}
      />
      {error?.message ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error.message}
        </p>
      ) : null}
    </div>
  );
}
