import type { Metadata } from 'next';
import { RegisterForm } from '@/features/auth/register/components/RegisterForm';

export const metadata: Metadata = {
  title: 'Регистрация — Coffee Ride',
};

// First real screen (CR-011). One `<h1>` per page (docs/design.md §12).
export default function RegisterPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold text-text">Регистрация</h1>
      <RegisterForm />
    </main>
  );
}
