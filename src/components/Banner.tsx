import { useEffect, useRef } from "react";
import { useApp } from "../state/AppContext";

export function Banner() {
  const { banner, hideBanner, db } = useApp();
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
  if (db.memoryOnly)
    return (
      <div id="banner" className="banner">
        This browser is blocking storage for this page, so changes will be lost when you close it. Use Export to keep them, or open the page
        through the start script.
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
