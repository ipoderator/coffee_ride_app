'use client';

import { Search } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { ADMIN_TERMS, Button, Input } from 'ui';
import { ADMIN_SEARCH_MAX_LENGTH } from '@/lib/admin/url-filters';

/**
 * CR-231: an admin list's search box. Submits on Enter or «Найти» — no
 * debounce, so a list query runs only when the admin asks for it.
 *
 * CR-232: `initialValue` is the list's `q` from the URL; when it changes from
 * outside (back/forward, a link) the field follows it — React's "adjust state
 * on a prop change", so typing in between is kept until then.
 */
export function AdminSearchForm({
  label,
  initialValue = '',
  onSearch,
}: {
  label: string;
  initialValue?: string;
  onSearch: (query: string) => void;
}) {
  const inputId = useId();
  const [value, setValue] = useState(initialValue);
  const [shownInitial, setShownInitial] = useState(initialValue);
  if (initialValue !== shownInitial) {
    setShownInitial(initialValue);
    setValue(initialValue);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearch(value.trim());
  }

  return (
    <form
      noValidate
      role="search"
      onSubmit={handleSubmit}
      className="flex min-w-0 flex-1 items-end gap-2"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <label htmlFor={inputId} className="text-body-sm font-medium text-text">
          {label}
        </label>
        <Input
          id={inputId}
          type="search"
          maxLength={ADMIN_SEARCH_MAX_LENGTH}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </div>
      <Button type="submit" variant="secondary">
        <Search aria-hidden="true" className="size-4" />
        {ADMIN_TERMS.search}
      </Button>
    </form>
  );
}
