/** Data/hora sempre serializada em ISO 8601 (UTC). */
export type IsoDate = string;

/** Imagem persistida localmente como data URL ja comprimida. */
export type StoredImage = string;

export interface Timestamped {
  createdAt: IsoDate;
  updatedAt: IsoDate;
}
