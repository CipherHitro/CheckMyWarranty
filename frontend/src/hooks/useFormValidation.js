import { useState, useCallback } from "react";

const validators = {
  name: (value) => {
    if (!value.trim()) return "Name is required";
    if (value.trim().length < 2) return "Name must be at least 2 characters";
    return "";
  },
  email: (value) => {
    if (!value.trim()) return "Email is required";
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!regex.test(value)) return "Please enter a valid email";
    return "";
  },
  password: (value) => {
    if (!value) return "Password is required";
    if (value.length < 8) return "Password must be at least 8 characters";
    if (!/[A-Z]/.test(value))
      return "Password must contain at least one uppercase letter";
    if (!/[a-z]/.test(value))
      return "Password must contain at least one lowercase letter";
    if (!/[0-9]/.test(value))
      return "Password must contain at least one number";
    if (!/[^A-Za-z0-9]/.test(value))
      return "Password must contain at least one special character";
    return "";
  },
  confirmPassword: (value, allValues) => {
    if (!value) return "Please confirm your password";
    if (value !== allValues.password) return "Passwords do not match";
    return "";
  },
};

/**
 * Custom hook for form validation.
 * @param {Object} initialValues - { fieldName: defaultValue }
 * @param {string[]} fieldNames  - fields to validate (keys in `validators`)
 */
export const useFormValidation = (initialValues, fieldNames = []) => {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});

  const handleChange = useCallback(
    (e) => {
      const { name, value } = e.target;
      setValues((prev) => ({ ...prev, [name]: value }));

      // Live-clear error once user starts fixing
      if (touched[name] && validators[name]) {
        const err = validators[name](value, { ...values, [name]: value });
        setErrors((prev) => ({ ...prev, [name]: err }));
      }
    },
    [touched, values]
  );

  const handleBlur = useCallback(
    (e) => {
      const { name, value } = e.target;
      setTouched((prev) => ({ ...prev, [name]: true }));
      if (validators[name]) {
        setErrors((prev) => ({
          ...prev,
          [name]: validators[name](value, values),
        }));
      }
    },
    [values]
  );

  const validateAll = useCallback(() => {
    const newErrors = {};
    let isValid = true;

    for (const field of fieldNames) {
      if (validators[field]) {
        const err = validators[field](values[field] ?? "", values);
        newErrors[field] = err;
        if (err) isValid = false;
      }
    }

    setErrors(newErrors);
    setTouched(
      fieldNames.reduce((acc, f) => ({ ...acc, [f]: true }), {})
    );
    return isValid;
  }, [fieldNames, values]);

  const resetForm = useCallback(() => {
    setValues(initialValues);
    setErrors({});
    setTouched({});
  }, [initialValues]);

  return {
    values,
    errors,
    touched,
    handleChange,
    handleBlur,
    validateAll,
    resetForm,
    setValues,
  };
};
