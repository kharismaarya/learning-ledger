import { useEffect, useRef } from "react";
import { useApp } from "../state/AppContext";

export function Banner() {
  const { banner, hideBanner } = useApp();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (banner) ref.current?.scrollIntoView({ block: "nearest" });
  }, [banner]);

  if (banner)
    return (
      <div id="banner" className="banner" ref={ref}>
        <div>{banner.msg}</div>
        <div className="row">
          {banner.buttons ?? (
            <button className="btn" onClick={hideBanner}>
              OK
            </button>
          )}
        </div>
      </div>
    );
  return null;
}

export function Toast() {
  const { toastMsg } = useApp();
  return (
    <div className="toast" id="toast" hidden={!toastMsg} role="status">
      {toastMsg}
    </div>
  );
}
