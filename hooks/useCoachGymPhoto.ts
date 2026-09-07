import { useCallback, useEffect, useRef, useState } from "react";
import { acceptGymPhotoConsent, cleanupGymPhoto, GYM_PHOTO_DISCLOSURE, hasGymPhotoConsent, pickAndPrepareGymPhoto, type PreparedGymPhoto } from "@/lib/coach-gym-photo";

export function useCoachGymPhoto() {
  const [consented, setConsented] = useState(false);
  const photoRef = useRef<PreparedGymPhoto | null>(null);
  useEffect(() => () => cleanupGymPhoto(photoRef.current), []);
  const ensureConsent = useCallback(async () => {
    try {
      const accepted = await hasGymPhotoConsent();
      if (accepted) setConsented(true);
      return accepted;
    } catch {
      return false;
    }
  }, []);
  // Consent is external persisted state; hydrate it once on mount.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void ensureConsent(); }, [ensureConsent]);
  const consent = useCallback(async () => { await acceptGymPhotoConsent(); setConsented(true); }, []);
  const pick = useCallback(async () => {
    cleanupGymPhoto(photoRef.current);
    photoRef.current = null;
    const photo = await pickAndPrepareGymPhoto();
    photoRef.current = photo;
    return photo;
  }, []);
  const cleanup = useCallback(() => { cleanupGymPhoto(photoRef.current); photoRef.current = null; }, []);
  return { consented, disclosure: GYM_PHOTO_DISCLOSURE, ensureConsent, consent, pick, cleanup };
}
