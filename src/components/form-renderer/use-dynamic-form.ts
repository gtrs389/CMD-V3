'use client';

import { useCallback, useMemo, useState } from 'react';
import type { ClientFormConfig } from '@/lib/types';
import {
  buildDynamicSchema,
  emptyValues,
  type DynamicFormValues,
  type DynamicValue,
} from '@/lib/validation/dynamic-form';

export interface DynamicFormState {
  values: DynamicFormValues;
  errors: Record<string, string>;
  setValue: (fieldId: string, value: DynamicValue) => void;
  reset: (next?: DynamicFormValues) => void;
  /** Valida tudo e devolve os valores quando nao ha erro. */
  validate: () => DynamicFormValues | null;
  hasErrors: boolean;
}

/**
 * Estado do formulario dinamico com validacao tipada (zod).
 *
 * Os campos sao definidos em tempo de execucao pelo ADMIN, por isso o estado
 * e mantido por ID de campo e o schema e reconstruido quando a configuracao muda.
 */
export function useDynamicForm(
  config: ClientFormConfig,
  initialValues?: DynamicFormValues,
  onValuesChange?: (values: DynamicFormValues) => void,
): DynamicFormState {
  const schema = useMemo(() => buildDynamicSchema(config), [config]);
  const [values, setValues] = useState<DynamicFormValues>(
    () => initialValues ?? emptyValues(config),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const setValue = useCallback(
    (fieldId: string, value: DynamicValue) => {
      setValues((current) => {
        const next = { ...current, [fieldId]: value };
        onValuesChange?.(next);
        return next;
      });
      // Limpa o erro assim que a pessoa corrige o campo.
      setErrors((current) => {
        if (!current[fieldId]) return current;
        const next = { ...current };
        delete next[fieldId];
        return next;
      });
    },
    [onValuesChange],
  );

  const reset = useCallback(
    (next?: DynamicFormValues) => {
      setValues(next ?? emptyValues(config));
      setErrors({});
    },
    [config],
  );

  const validate = useCallback((): DynamicFormValues | null => {
    const result = schema.safeParse(values);
    if (result.success) {
      setErrors({});
      return result.data;
    }

    const collected: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path[0];
      if (typeof key === 'string' && !collected[key]) collected[key] = issue.message;
    }
    setErrors(collected);
    return null;
  }, [schema, values]);

  return {
    values,
    errors,
    setValue,
    reset,
    validate,
    hasErrors: Object.keys(errors).length > 0,
  };
}
