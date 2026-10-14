import type { AnchorHTMLAttributes, ReactNode } from "react";
/** Next client transport is replaced by ordinary same-origin browser navigation. */
export default function Link({ href, children, prefetch: _prefetch, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: ReactNode; prefetch?: boolean }) {
  void _prefetch;
  return <a href={href} {...props}>{children}</a>;
}
export function usePathname() { return window.location.pathname; }
