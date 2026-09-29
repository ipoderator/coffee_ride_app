'use client';

import { useRef, useState, type DragEvent } from 'react';
import { Upload, X } from 'lucide-react';
import { RIDE_CREATE_TERMS, cn } from 'ui';

interface GpxDropzoneProps {
  id: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  error?: string;
  disabled?: boolean;
}

/**
 * CR-156: step 1's GPX drop zone (mockup). Drag-and-drop or the native file
 * picker behind a real `<button>` — the hidden `<input type="file">` keeps
 * the browser's own file API; validation (type/size) is the caller's.
 */
export function GpxDropzone({
  id,
  file,
  onFileChange,
  error,
  disabled = false,
}: GpxDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (disabled) return;
    event.preventDefault();
    setIsDragOver(true);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(false);
    if (disabled) return;
    const dropped = event.dataTransfer.files[0];
    if (dropped) onFileChange(dropped);
  }

  function clear() {
    if (inputRef.current) inputRef.current.value = '';
    onFileChange(null);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div
        onDragOver={handleDragOver}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          'flex flex-col items-center gap-2 rounded-2xl border-[1.5px] border-dashed px-4 py-8 text-center transition-colors',
          isDragOver
            ? 'border-primary bg-primary-tint'
            : 'border-border-input bg-surface',
          error && 'border-danger',
          disabled && 'opacity-60',
        )}
      >
        <Upload aria-hidden="true" className="size-6 text-text-secondary" />
        {file ? (
          <p className="flex flex-wrap items-center justify-center gap-x-2 text-body-sm font-semibold text-text">
            <span className="break-all">
              {RIDE_CREATE_TERMS.gpxSelected(file.name)}
            </span>
            <button
              type="button"
              onClick={clear}
              disabled={disabled}
              className="inline-flex min-h-11 items-center gap-1 font-medium text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <X aria-hidden="true" className="size-4" />
              {RIDE_CREATE_TERMS.gpxRemove}
            </button>
          </p>
        ) : (
          <p className="text-body-sm font-semibold text-text">
            {RIDE_CREATE_TERMS.gpxDropTitle}{' '}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={disabled}
              aria-describedby={error ? `${hintId} ${errorId}` : hintId}
              className="font-semibold text-primary underline underline-offset-2 hover:text-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {RIDE_CREATE_TERMS.gpxDropPick}
            </button>
          </p>
        )}
        <p id={hintId} className="text-body-sm text-text-muted">
          {RIDE_CREATE_TERMS.gpxDropHint}
        </p>
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept=".gpx,application/gpx+xml"
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          disabled={disabled}
          onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
        />
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-body-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
