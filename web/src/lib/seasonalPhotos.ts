import type { Season } from "./tripPreferences";

export interface SeasonalPhoto {
  id: string;
  season: Season;
  location: string;
  title: string;
  image: string;
  imageAlt: string;
  creator: string;
  license: string;
  licenseUrl: string;
  sourceUrl: string;
}

const SEASONS = new Set<Season>(["spring", "summer", "autumn", "winter"]);

export function isSeasonalPhoto(value: unknown): value is SeasonalPhoto {
  if (typeof value !== "object" || value === null) return false;
  const photo = value as Record<string, unknown>;

  return (
    typeof photo.id === "string" &&
    SEASONS.has(photo.season as Season) &&
    typeof photo.location === "string" &&
    typeof photo.title === "string" &&
    typeof photo.image === "string" &&
    photo.image.startsWith("https://") &&
    typeof photo.imageAlt === "string" &&
    typeof photo.creator === "string" &&
    typeof photo.license === "string" &&
    typeof photo.licenseUrl === "string" &&
    typeof photo.sourceUrl === "string" &&
    photo.sourceUrl.startsWith("https://")
  );
}
