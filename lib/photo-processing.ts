import * as ImageManipulator from "expo-image-manipulator";
import { File, Directory, Paths } from "expo-file-system";

import { ensurePhotoDirs } from "./db/photos";
import { uuid } from "./uuid";

export const MAX_DIMENSION = 1200;
export const THUMB_SIZE = 300;

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function processImage(
  uri: string
): Promise<{ fullUri: string; thumbUri: string; width: number; height: number }> {
  const resized = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: MAX_DIMENSION } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
  );

  const thumb = await ImageManipulator.manipulateAsync(
    resized.uri,
    [{ resize: { width: THUMB_SIZE } }],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
  );

  ensurePhotoDirs();

  const photoId = uuid();
  const fileName = `${photoId}.jpg`;
  const thumbName = `thumb_${photoId}.jpg`;
  const photoDir = new Directory(Paths.document, "progress-photos");
  const thumbDir = new Directory(Paths.document, "progress-photos", "thumbnails");
  const destFile = new File(photoDir, fileName);
  const thumbFile = new File(thumbDir, thumbName);

  const resizedFile = new File(resized.uri);
  resizedFile.move(destFile);
  const thumbSrcFile = new File(thumb.uri);
  thumbSrcFile.move(thumbFile);

  return {
    fullUri: destFile.uri,
    thumbUri: thumbFile.uri,
    width: resized.width,
    height: resized.height,
  };
}
