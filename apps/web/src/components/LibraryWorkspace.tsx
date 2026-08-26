import type { ComponentProps } from "react";
import { LibraryView } from "./LibraryView";

export function LibraryWorkspace({
  open,
  ...props
}: { open: boolean } & ComponentProps<typeof LibraryView>) {
  return open ? <LibraryView {...props} /> : null;
}
