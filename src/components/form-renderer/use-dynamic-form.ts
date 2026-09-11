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
  /**
   * Marca um campo com uma mensagem vinda do servidor.
   *
   * Existe para as regras que so o servidor conhece — telefone ja cadastrado
   * naquele time, por exemplo. O erro some assim que a pessoa corrige o
   * campo, como qualquer outro.
   */
  setFieldError: (fieldId: string, message: string) => void;
  reset: (next?: DynamicFormValues) => void;
  /** Valida tudo e devolve os valores quando nao ha erro. */
  validate: () => DynamicFormValues | null;
  /**
   * Valida somente os campos informados, para formularios em etapas.
   *
   * Erro de outra etapa nao impede o avanco nem aparece na tela: o que vale
   * e o que esta sendo preenchido agora. O envio final continua passando por
   * `validate`, que confere tudo.
   */
  validateOnly: (fieldIds: readonly string[]) => boolean;
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

  const setFieldError = useCallback((fieldId: string, message: string) => {
    setErrors((current) => ({ ...current, [fieldId]: message }));
  }, []);

  const reset = useCallback(
    (next?: DynamicFormValues) => {
      setValues(next ?? emptyValues(config));
      setErrors({});
    },
    [config],
  );

  /** Erros de todos os campos, sem tocar no estado da tela. */
  const collectErrors = useCallback((): Record<string, string> => {
    const result = schema.safeParse(values);
    if (result.success) return {};

    const collected: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path[0];
      if (typeof key === 'string' && !collected[key]) collected[key] = issue.message;
    }
    return collected;
  }, [schema, values]);

  const validate = useCallback((): DynamicFormValues | null => {
    const result = schema.safeParse(values);
    if (result.success) {
      setErrors({});
      return result.data;
    }
    setErrors(collectErrors());
    return null;
  }, [collectErrors, schema, values]);

  const validateOnly = useCallback(
    (fieldIds: readonly string[]): boolean => {
      const scope = new Set(fieldIds);
      const found = collectErrors();

      const step: Record<string, string> = {};
      for (const [key, message] of Object.entries(found)) {
        if (scope.has(key)) step[key] = message;
      }

      setErrors(step);
      return Object.keys(step).length === 0;
    },
    [collectErrors],
  );

  return {
    values,
    errors,
    setValue,
    setFieldError,
    reset,
    validate,
    validateOnly,
    hasErrors: Object.keys(errors).length > 0,
  };
}
