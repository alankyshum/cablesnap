import { useCallback, useRef, useState } from "react";

type FieldErrors<T> = Partial<Record<keyof T, string>>;

type FormOptions<T extends Record<string, unknown>> = {
  initial: T;
  validate?: (values: T) => FieldErrors<T>;
};

export function useFormFields<T extends Record<string, unknown>>(options: FormOptions<T>) {
  const [values, setValues] = useState<T>(options.initial);
  const [errors, setErrors] = useState<FieldErrors<T>>({});
  const [dirty, setDirty] = useState(false);
  const validateRef = useRef(options.validate);
  validateRef.current = options.validate;

  const setValue = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
    setDirty(true);
  }, []);

  const validate = useCallback((): boolean => {
    if (!validateRef.current) return true;
    const errs = validateRef.current(values);
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }, [values]);

  const reset = useCallback((newValues?: T) => {
    setValues(newValues ?? options.initial);
    setErrors({});
    setDirty(false);
  }, [options.initial]);

  return { values, errors, dirty, setValue, validate, reset, setErrors };
}
