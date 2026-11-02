import type { CSSProperties, ReactNode } from "react";
import { Notice, type NoticeTone } from "@acm/ui";
import { noticeToneFromCopy } from "../../lib/notice-tone";

/** Status / tip line: entitlement copy gets a colored notice; other copy stays muted. */
export function CopyNotice({
  copy,
  tone,
  children,
  className,
  style,
}: {
  copy?: string;
  tone?: NoticeTone | null;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const text = copy ?? "";
  const resolved = tone === undefined ? noticeToneFromCopy(text) : tone;
  const body = children ?? text;
  if (!resolved) {
    return (
      <p className={["muted", className].filter(Boolean).join(" ")} style={{ margin: 0, ...style }}>
        {body}
      </p>
    );
  }
  return (
    <Notice tone={resolved} className={className} style={style}>
      {body}
    </Notice>
  );
}
