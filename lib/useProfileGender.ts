import { useState, useCallback } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { getBodySettings } from "./db/body";
import type { Sex } from "./nutrition-calc";

/**
 * Returns the user's sex/gender from body settings.
 * Re-reads on every screen focus so changes propagate immediately.
 * Defaults to "male" if no setting is saved.
 */
export function useProfileGender(): Sex {
  const [gender, setGender] = useState<Sex>("male");

  useFocusEffect(
    useCallback(() => {
      getBodySettings()
        .then((settings) => {
          if (settings.sex === "male" || settings.sex === "female") {
            setGender(settings.sex);
          }
        })
        .catch(() => {
          // DB error — keep default
        });
    }, [])
  );

  return gender;
}
