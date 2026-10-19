import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

type Option<T extends string> = { value: T; label: string };

type SegmentedControlProps<T extends string> = {
  value: T;
  options: readonly Option<T>[];
  onValueChange: (value: T) => void;
};

/** Typed wrapper over shadcn Tabs used as a segmented control. */
export function SegmentedControl<T extends string>({
  value,
  options,
  onValueChange,
}: SegmentedControlProps<T>) {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => {
        const option = options.find((o) => o.value === next);
        if (option) onValueChange(option.value);
      }}
    >
      <TabsList>
        {options.map((option) => (
          <TabsTrigger key={option.value} value={option.value}>
            {option.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
