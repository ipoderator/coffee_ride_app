import type { SVGProps } from 'react';

/**
 * CR-186: the «Группы» section's icon — `account-add` from Material Line Icons
 * (line-md, picked by the owner on 21st.dev). Copyright 2020 Vjacheslav
 * Trushkin, MIT — `./licenses/MIT-line-md.txt`. Only the set's final frame:
 * its SMIL draw-in is dropped, since an icon on a resting row doesn't animate
 * (`docs/design.md` §5 Motion). Same stroke and props as a `lucide-react`
 * icon, so `CABINET_ICONS` renders it the same way.
 */
export function AccountAddIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M3 21v-1c0 -2.21 1.79 -4 4 -4h4c2.21 0 4 1.79 4 4v1" />
      <path d="M9 13c-1.66 0 -3 -1.34 -3 -3c0 -1.66 1.34 -3 3 -3c1.66 0 3 1.34 3 3c0 1.66 -1.34 3 -3 3Z" />
      <path d="M15 6h6" />
      <path d="M18 3v6" />
    </svg>
  );
}
