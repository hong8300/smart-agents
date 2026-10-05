import { presetUrl } from "../avatars";

interface Props {
  avatar: string;
  size?: number;
  color?: string;
  title?: string;
  className?: string;
}

export function Avatar({ avatar, size = 32, color = "#8A94A6", title, className = "" }: Props) {
  const style = { width: size, height: size, minWidth: size };
  if (avatar.startsWith("emoji:")) {
    return (
      <span
        className={`avatar avatar-emoji ${className}`}
        style={{ ...style, background: color, fontSize: size * 0.58 }}
        title={title}
      >
        {avatar.slice(6)}
      </span>
    );
  }
  const src = avatar.startsWith("preset:") ? presetUrl(avatar.slice(7)) : avatar;
  return <img className={`avatar ${className}`} style={style} src={src} alt={title ?? ""} title={title} draggable={false} />;
}
