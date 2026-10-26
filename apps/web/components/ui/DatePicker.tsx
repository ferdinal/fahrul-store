'use client';

import { useState } from 'react';
import { DayPicker } from 'react-day-picker';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: (date: Date) => boolean;
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Pilih tanggal',
  disabled,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);

  const selectedDate = value ? new Date(`${value}T00:00:00`) : undefined;

  function handleSelect(date: Date | undefined) {
    if (!date) {
      return;
    }

    const formatted = format(date, 'yyyy-MM-dd');

    onChange(formatted);
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        disabled={disabled === undefined ? false : false}
        className="flex w-full items-center justify-between rounded-lg border border-blue-900/50 bg-[#070b1a] px-4 py-3 text-left text-sm outline-none transition hover:border-blue-700 focus:border-blue-500"
      >
        <span className={selectedDate ? 'text-white' : 'text-gray-600'}>
          {selectedDate
            ? format(selectedDate, 'dd MMMM yyyy', {
                locale: id,
              })
            : placeholder}
        </span>

        <span className="text-gray-500">📅</span>
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close calendar"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />

          <div className="absolute left-0 z-50 mt-2 rounded-xl border border-blue-900/50 bg-[#0a1024] p-3 shadow-2xl">
            <DayPicker
              mode="single"
              selected={selectedDate}
              onSelect={handleSelect}
              disabled={disabled}
              locale={id}
              showOutsideDays
              captionLayout="dropdown"
              classNames={{
                root: 'text-white',
                months: 'flex',
                month: 'space-y-4',
                month_caption: 'flex items-center justify-between px-2',
                caption_label: 'text-sm font-semibold text-blue-300',
                dropdowns: 'flex items-center gap-2',
                dropdown:
                  'rounded-md border border-blue-900/50 bg-[#070b1a] px-2 py-1 text-sm text-white',
                weekdays: 'grid grid-cols-7 gap-1',
                weekday: 'w-9 text-center text-xs font-medium text-gray-500',
                week: 'grid grid-cols-7 gap-1 mt-1',
                day: 'relative h-9 w-9 text-center text-sm',
                day_button:
                  'h-9 w-9 rounded-lg text-gray-300 transition hover:bg-blue-950 hover:text-white',
                selected: 'bg-blue-600 text-white hover:bg-blue-600',
                today: 'border border-blue-500 text-blue-300',
                outside: 'text-gray-700',
                disabled: 'cursor-not-allowed text-gray-700 opacity-50',
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
