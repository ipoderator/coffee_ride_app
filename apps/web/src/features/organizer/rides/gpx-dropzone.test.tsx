import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GpxDropzone } from './components/GpxDropzone';

const gpx = () =>
  new File(['<gpx/>'], 'loop.gpx', { type: 'application/gpx+xml' });

function fileInput(container: HTMLElement) {
  return container.querySelector('input[type="file"]') as HTMLInputElement;
}

describe('GpxDropzone (CR-156)', () => {
  it('opens the native picker from its button and reports the chosen file', () => {
    const onFileChange = vi.fn();
    const { container } = render(
      <GpxDropzone id="gpx" file={null} onFileChange={onFileChange} />,
    );
    const input = fileInput(container);
    const click = vi.spyOn(input, 'click');

    fireEvent.click(
      screen.getByRole('button', { name: 'выберите на компьютере' }),
    );
    expect(click).toHaveBeenCalled();

    const file = gpx();
    fireEvent.change(input, { target: { files: [file] } });
    expect(onFileChange).toHaveBeenCalledWith(file);
  });

  it('accepts a dropped file', () => {
    const onFileChange = vi.fn();
    const { container } = render(
      <GpxDropzone id="gpx" file={null} onFileChange={onFileChange} />,
    );
    const zone = fileInput(container).parentElement as HTMLElement;
    const file = gpx();

    fireEvent.dragOver(zone, { dataTransfer: { files: [file] } });
    expect(zone).toHaveClass('border-primary');
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });

    expect(onFileChange).toHaveBeenCalledWith(file);
    expect(zone).not.toHaveClass('border-primary');
  });

  it('ignores drops while disabled', () => {
    const onFileChange = vi.fn();
    const { container } = render(
      <GpxDropzone id="gpx" file={null} onFileChange={onFileChange} disabled />,
    );
    const zone = fileInput(container).parentElement as HTMLElement;

    fireEvent.dragOver(zone, { dataTransfer: { files: [gpx()] } });
    expect(zone).not.toHaveClass('border-primary');
    fireEvent.drop(zone, { dataTransfer: { files: [gpx()] } });

    expect(onFileChange).not.toHaveBeenCalled();
  });

  it('names the selected file and clears it', () => {
    const onFileChange = vi.fn();
    render(<GpxDropzone id="gpx" file={gpx()} onFileChange={onFileChange} />);

    expect(screen.getByText('Выбран файл «loop.gpx»')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Убрать файл' }));

    expect(onFileChange).toHaveBeenCalledWith(null);
  });

  it('announces an error and links it to the picker button', () => {
    render(
      <GpxDropzone
        id="gpx"
        file={null}
        onFileChange={vi.fn()}
        error="Нужен файл в формате GPX."
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Нужен файл в формате GPX.',
    );
    expect(
      screen.getByRole('button', { name: 'выберите на компьютере' }),
    ).toHaveAttribute('aria-describedby', 'gpx-hint gpx-error');
  });
});
