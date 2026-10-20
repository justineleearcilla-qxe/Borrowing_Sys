import { useEffect, useState } from "react";
import { CategoryIcon } from "./CategoryIcon";

export function ItemImage({
  imageUrl,
  categorySlug,
  alt,
  className = "",
  iconClassName = "h-14 w-14",
}: {
  imageUrl: string | null;
  categorySlug: string;
  alt: string;
  className?: string;
  iconClassName?: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [imageUrl]);

  return (
    <div
      className={`flex items-center justify-center overflow-hidden bg-slate-100 text-slate-400 ${className}`}
    >
      {imageUrl && !failed ? (
        <img
          src={imageUrl}
          alt={alt}
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <CategoryIcon slug={categorySlug} className={iconClassName} />
      )}
    </div>
  );
}
