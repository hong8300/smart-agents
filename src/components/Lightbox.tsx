import { useEffect } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { imageSrc } from "../api";

export function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isFile = !src.startsWith("data:");
  return (
    <div className="lightbox" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <img src={imageSrc(src)} alt="画像" />
      <div className="lightbox-bar">
        {isFile && (
          <button className="btn" onClick={() => void revealItemInDir(src)}>
            フォルダで表示
          </button>
        )}
        {!isFile && (
          <a className="btn" href={src} download="image.svg">
            SVG を保存
          </a>
        )}
        <button className="btn" onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  );
}
