import { useState } from 'react';
import { User } from 'lucide-react';

interface UserAvatarProps {
  avatar?: string | null;
  name?: string;
  size?: number;
  className?: string;
}

export function UserAvatar({
  avatar,
  name,
  size = 40,
  className = '',
}: UserAvatarProps) {
  const [imgError, setImgError] = useState(false);

  const showImage = avatar && !imgError;

  const fallbackChar = name?.trim().charAt(0).toUpperCase() || null;

  return (
    <div
      className={`flex items-center justify-center flex-shrink-0 overflow-hidden rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        background: showImage
          ? undefined
          : 'linear-gradient(135deg, var(--primary-400), var(--accent-400))',
      }}
    >
      {showImage ? (
        <img
          src={avatar!}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : fallbackChar ? (
        <span
          className="font-semibold text-white select-none"
          style={{ fontSize: Math.max(size * 0.45, 10) }}
        >
          {fallbackChar}
        </span>
      ) : (
        <User size={size * 0.5} className="text-white" />
      )}
    </div>
  );
}
